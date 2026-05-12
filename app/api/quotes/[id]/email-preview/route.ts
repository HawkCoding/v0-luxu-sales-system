import { NextResponse } from "next/server"
import { z } from "zod"
import { renderQuoteEmail } from "@/lib/quotes/render-quote-email"
import { createSessionClient } from "@/lib/supabase/server"

const previewSchema = z.object({
  introText: z.string().trim().min(1).optional(),
  subject: z.string().trim().min(1).optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function POST(req: Request, { params }: RouteParams) {
  const supabase = await createSessionClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const parsed = previewSchema.safeParse(await req.json())

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
  }

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select(
      "id, booking_id, quote_number, validity_until, subtotal, vat, total, created_at, booking:bookings(booking_number, customer:customers(first_name, last_name))",
    )
    .eq("id", id)
    .single()

  if (quoteError || !quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 })
  }

  const { data: lineItems, error: lineItemsError } = await supabase
    .from("quote_line_items")
    .select("description, supplier_description, qty, unit_price, total")
    .eq("quote_id", id)
    .order("sort_order", { ascending: true })

  if (lineItemsError) {
    return NextResponse.json({ error: "Failed to load quote line items" }, { status: 500 })
  }

  if (!lineItems || lineItems.length === 0) {
    return NextResponse.json({ error: "Quote must have line items before it can be sent" }, { status: 400 })
  }

  const booking = Array.isArray(quote.booking) ? quote.booking[0] : quote.booking
  const customer = Array.isArray(booking?.customer) ? booking?.customer[0] : booking?.customer
  const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ").trim()
  const quoteNumber = quote.quote_number ?? `${booking?.booking_number ?? "QUOTE"}-Q1`
  const introText =
    parsed.data.introText ??
    "Thank you for your enquiry. We are pleased to share your Luxus Travel & Tours quote for review."
  const subject = parsed.data.subject ?? `Quote ${quoteNumber} - Luxus Travel & Tours`

  const html = await renderQuoteEmail({
    customerName,
    introText,
    quote: {
      quoteNumber,
      quoteDate: quote.created_at?.slice(0, 10) ?? todayDateString(),
      validUntil: quote.validity_until,
      subtotal: quote.subtotal,
      vat: quote.vat,
      total: quote.total,
      lineItems: lineItems.map((item) => ({
        description: item.description,
        supplierDescription: item.supplier_description ?? null,
        qty: item.qty,
        unitPrice: item.unit_price,
        total: item.total,
      })),
    },
  })

  return NextResponse.json({ html, subject, introText, quoteNumber })
}
