import { NextResponse } from "next/server"
import { createSessionClient } from "@/lib/supabase/server"
import { formatDisplayDate } from "@/lib/date-format"

export async function POST(req: Request) {
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()

  // Accept jobId (from existing components) or bookingId
  const bookingId = body.bookingId || body.jobId

  const { data: quote, error } = await supabase
    .from("quotes")
    .insert({
      booking_id: bookingId,
      itinerary_id: body.itineraryId || null,
      status: body.status || "draft",
      validity_until: body.validityUntil || null,
      subtotal: body.subtotal || 0,
      vat: body.vat || 0,
      total: body.total || 0,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Insert line items if provided
  const lineItems: any[] = body.lineItems || []
  if (lineItems.length > 0) {
    await supabase.from("quote_line_items").insert(
      lineItems.map((li: any, idx: number) => ({
        quote_id: quote.id,
        description: li.description,
        qty: li.qty ?? 1,
        unit_price: li.unitPrice ?? 0,
        total: li.total ?? 0,
        sort_order: idx,
      }))
    )
  }

  return NextResponse.json({
    id: quote.id,
    jobId: quote.booking_id,
    bookingId: quote.booking_id,
    itineraryId: quote.itinerary_id,
    status: quote.status,
    validityUntil: quote.validity_until,
    validityUntilDisplay: formatDisplayDate(quote.validity_until),
    subtotal: quote.subtotal,
    vat: quote.vat,
    total: quote.total,
    lineItems,
  })
}
