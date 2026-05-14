import { NextResponse } from "next/server"
import { createSessionClient } from "@/lib/supabase/server"
import { reviseQuoteNumber } from "@/lib/quotes/quote-number"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(_req: Request, { params }: RouteParams) {
  const supabase = await createSessionClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("id, booking_id, itinerary_id, status, validity_until, subtotal, vat, total, no_package_match, quote_number, booking:bookings(booking_number)")
    .eq("id", id)
    .single()

  if (quoteError || !quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 })
  }

  const revisableStatuses = ["sent", "accepted", "expired"]
  if (!revisableStatuses.includes(quote.status)) {
    return NextResponse.json(
      { error: "Only sent, accepted, or expired quotes can be revised" },
      { status: 400 },
    )
  }

  const { data: lineItems, error: lineItemsError } = await supabase
    .from("quote_line_items")
    .select("description, qty, unit_price, total, sort_order")
    .eq("quote_id", id)
    .order("sort_order", { ascending: true })

  if (lineItemsError) {
    return NextResponse.json({ error: "Failed to load quote line items" }, { status: 500 })
  }

  const booking = Array.isArray(quote.booking) ? quote.booking[0] : quote.booking
  const quoteNumber = reviseQuoteNumber(quote.quote_number, booking?.booking_number ?? "QUOTE")
  const { data: revisedQuote, error: insertError } = await supabase
    .from("quotes")
    .insert({
      booking_id: quote.booking_id,
      itinerary_id: quote.itinerary_id,
      status: "draft",
      validity_until: quote.validity_until,
      subtotal: quote.subtotal,
      vat: quote.vat,
      total: quote.total,
      no_package_match: quote.no_package_match,
      quote_number: quoteNumber,
      parent_quote_id: quote.id,
    })
    .select("id, booking_id, status, quote_number, parent_quote_id")
    .single()

  if (insertError || !revisedQuote) {
    return NextResponse.json({ error: "Failed to revise quote" }, { status: 500 })
  }

  if (lineItems && lineItems.length > 0) {
    const { error: copyError } = await supabase.from("quote_line_items").insert(
      lineItems.map((item) => ({
        quote_id: revisedQuote.id,
        description: item.description,
        qty: item.qty,
        unit_price: item.unit_price,
        total: item.total,
        sort_order: item.sort_order,
      })),
    )

    if (copyError) {
      return NextResponse.json({ error: "Failed to copy quote line items" }, { status: 500 })
    }
  }

  // Mark parent as superseded now that a new version exists
  await supabase.from("quotes").update({ status: "superseded" }).eq("id", id)

  // Audit entry on the parent quote (version created)
  await supabase.from("audit_logs").insert({
    actor: user.email ?? "System",
    actor_user_id: user.id,
    entity_type: "Quote",
    entity_id: id,
    action: "quote_version_created",
    before_json: { status: quote.status, quote_number: quote.quote_number },
    after_json: {
      status: "superseded",
      successor_id: revisedQuote.id,
      successor_number: quoteNumber,
    },
  })

  return NextResponse.json({
    id: revisedQuote.id,
    jobId: revisedQuote.booking_id,
    bookingId: revisedQuote.booking_id,
    status: revisedQuote.status,
    quoteNumber: revisedQuote.quote_number,
    parentQuoteId: revisedQuote.parent_quote_id,
  })
}
