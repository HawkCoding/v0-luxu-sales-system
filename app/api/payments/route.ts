import { NextResponse } from "next/server"
import { createSessionClient } from "@/lib/supabase/server"
import { formatDisplayDateTime } from "@/lib/date-format"

export async function POST(req: Request) {
  const body = await req.json()
  const supabase = await createSessionClient()

  // Accept jobId (from existing components) or bookingId
  const bookingId = body.bookingId || body.jobId

  const { data: payment, error } = await supabase
    .from("payments")
    .insert({
      booking_id: bookingId,
      amount: body.amount,
      received_at: body.receivedAt || new Date().toISOString(),
      method: body.method,
      reference: body.reference,
      notes: body.notes || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from("audit_logs").insert({
    actor: body.actor || "consultant",
    entity_type: "Payment",
    entity_id: payment.id,
    action: "payment_recorded",
    after_json: { amount: payment.amount, method: payment.method },
  })

  return NextResponse.json({
    id: payment.id,
    jobId: payment.booking_id,
    bookingId: payment.booking_id,
    amount: payment.amount,
    receivedAt: payment.received_at,
    receivedAtDisplay: formatDisplayDateTime(payment.received_at),
    method: payment.method,
    reference: payment.reference,
    notes: payment.notes,
  })
}
