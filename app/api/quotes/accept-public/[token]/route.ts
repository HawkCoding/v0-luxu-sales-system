import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import {
  calculateDepositAmount,
  getDefaultDepositPercentage,
} from "@/lib/pipeline/constants"

// This route uses createServiceClient() intentionally — quote acceptance is a
// public action performed by the customer via a secure token link. RLS cannot
// apply because the customer is not authenticated in Supabase Auth.

interface RouteParams {
  params: Promise<{ token: string }>
}

async function resolveToken(supabase: ReturnType<typeof createServiceClient>, token: string) {
  const { data, error } = await supabase
    .from("quote_acceptance_tokens")
    .select(
      "id, quote_id, expires_at, used_at, quote:quotes(id, status, validity_until, quote_number, subtotal, vat, total, booking_id, booking:bookings(id, booking_number, stage, customer:customers(first_name, last_name)))",
    )
    .eq("token", token)
    .maybeSingle()

  if (error || !data) return { error: "invalid" as const }
  if (data.used_at) return { error: "used" as const }
  if (new Date(data.expires_at) < new Date()) return { error: "expired" as const }

  const quote = Array.isArray(data.quote) ? data.quote[0] : data.quote
  if (!quote) return { error: "invalid" as const }

  return { token: data, quote }
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { token: tokenValue } = await params
  const supabase = createServiceClient()

  const resolved = await resolveToken(supabase, tokenValue)

  if ("error" in resolved) {
    const status = resolved.error === "used" || resolved.error === "expired" ? 410 : 404
    return NextResponse.json({ error: `Token is ${resolved.error}` }, { status })
  }

  const { quote } = resolved
  const booking = Array.isArray(quote.booking) ? quote.booking[0] : quote.booking
  const customer = Array.isArray(booking?.customer) ? booking.customer[0] : booking?.customer

  const { data: lineItems } = await supabase
    .from("quote_line_items")
    .select("description, supplier_description, qty, unit_price, total, sort_order")
    .eq("quote_id", quote.id)
    .order("sort_order", { ascending: true })

  return NextResponse.json({
    quoteNumber: quote.quote_number,
    bookingNumber: booking?.booking_number,
    customerName: [customer?.first_name, customer?.last_name].filter(Boolean).join(" ").trim() || null,
    validUntil: quote.validity_until,
    subtotal: quote.subtotal,
    vat: quote.vat,
    total: quote.total,
    lineItems: (lineItems ?? []).map((li) => ({
      description: li.description,
      supplierDescription: li.supplier_description,
      qty: li.qty,
      unitPrice: li.unit_price,
      total: li.total,
    })),
  })
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { token: tokenValue } = await params
  const supabase = createServiceClient()

  const resolved = await resolveToken(supabase, tokenValue)

  if ("error" in resolved) {
    const status = resolved.error === "used" || resolved.error === "expired" ? 410 : 404
    return NextResponse.json({ error: `Token is ${resolved.error}` }, { status })
  }

  const { token: tokenRecord, quote } = resolved

  if (quote.status !== "sent") {
    return NextResponse.json(
      { error: "This quote is no longer available for acceptance" },
      { status: 400 },
    )
  }

  const today = new Date().toISOString().slice(0, 10)
  if (quote.validity_until && quote.validity_until < today) {
    return NextResponse.json({ error: "This quote has expired" }, { status: 400 })
  }

  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"

  const now = new Date().toISOString()

  // 1. Consume the token
  const { error: tokenUpdateError } = await supabase
    .from("quote_acceptance_tokens")
    .update({ used_at: now, used_by_ip: clientIp })
    .eq("id", tokenRecord.id)

  if (tokenUpdateError) {
    return NextResponse.json({ error: "Failed to record acceptance" }, { status: 500 })
  }

  // 2. Accept the quote
  const { error: quoteUpdateError } = await supabase
    .from("quotes")
    .update({ status: "accepted" })
    .eq("id", quote.id)

  if (quoteUpdateError) {
    return NextResponse.json({ error: "Failed to accept quote" }, { status: 500 })
  }

  // 3. Advance booking to accepted stage
  const booking = Array.isArray(quote.booking) ? quote.booking[0] : quote.booking
  if (booking && booking.stage !== "accepted") {
    await supabase
      .from("bookings")
      .update({ stage: "accepted", accepted_at: now })
      .eq("id", booking.id)
  }

  // 4. Create draft deposit invoice at default percentage
  const depositPercentage = await getDefaultDepositPercentage(supabase)
  const depositAmount = calculateDepositAmount(quote.total, depositPercentage)

  if (booking && depositAmount > 0) {
    const { data: existingInvoice } = await supabase
      .from("invoices")
      .select("id")
      .eq("booking_id", booking.id)
      .eq("kind", "deposit")
      .in("status", ["draft", "sent"])
      .maybeSingle()

    if (!existingInvoice) {
      const { data: newInvoice } = await supabase
        .from("invoices")
        .insert({
          booking_id: booking.id,
          quote_id: quote.id,
          kind: "deposit",
          status: "draft",
          invoice_number: `${booking.booking_number}-DEP1`,
          deposit_percentage: depositPercentage,
          amount: depositAmount,
          currency: "ZAR",
          due_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
          created_by: null,
        })
        .select("id")
        .single()

      if (newInvoice) {
        await supabase.from("documents").insert({
          booking_id: booking.id,
          kind: "invoice_pdf",
          status: "generated",
          storage_path: `invoices/${newInvoice.id}`,
        })
      }
    }
  }

  // 5. Audit log
  await supabase.from("audit_logs").insert({
    actor: "Customer",
    actor_user_id: null,
    entity_type: "Quote",
    entity_id: quote.id,
    action: "quote_accepted",
    after_json: { status: "accepted", accepted_at: now },
    meta_json: {
      token_id: tokenRecord.id,
      ip: clientIp,
      method: "acceptance_link",
      booking_number: booking?.booking_number,
    },
  })

  return NextResponse.json({
    success: true,
    quoteNumber: quote.quote_number,
    bookingRef: booking?.booking_number,
  })
}
