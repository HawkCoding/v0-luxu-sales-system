import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { formatDisplayDateTime } from "@/lib/date-format"
import { syncBookingPaymentState } from "@/lib/invoices/sync-booking-payment-state"
import { getPaymentReferenceRequired } from "@/lib/settings-access"

const paymentSchema = z
  .object({
    bookingId: z.string().uuid().optional(),
    jobId: z.string().uuid().optional(),
    invoiceId: z.string().uuid().nullable().optional(),
    paymentDate: z.string().datetime({ offset: true }),
    amount: z.number().refine((v) => Number.isFinite(v) && v !== 0, {
      message: "amount must be non-zero",
    }),
    paymentKind: z.enum(["capture", "refund"]).default("capture"),
    method: z.string().trim().min(1).max(50),
    reference: z.string().trim().max(120).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => Boolean(v.bookingId ?? v.jobId), {
    message: "bookingId or jobId is required",
    path: ["bookingId"],
  })
  .refine((v) => v.paymentKind !== "capture" || v.amount > 0, {
    message: "capture payments must have a positive amount",
    path: ["amount"],
  })
  .refine((v) => v.paymentKind !== "refund" || v.amount < 0, {
    message: "refund payments must have a negative amount",
    path: ["amount"],
  })

export async function POST(req: Request) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = paymentSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)

  const { supabase, profile, user } = auth.value
  const bookingId = (parsed.data.bookingId ?? parsed.data.jobId) as string

  const referenceRequired = await getPaymentReferenceRequired(supabase)
  if (referenceRequired && !parsed.data.reference?.trim()) {
    return jsonError("Payment reference is required", 400)
  }

  const { data: payment, error } = await supabase
    .from("payments")
    .insert({
      booking_id: bookingId,
      invoice_id: parsed.data.invoiceId ?? null,
      amount: parsed.data.amount,
      received_at: parsed.data.paymentDate,
      payment_kind: parsed.data.paymentKind,
      captured_by: user.id,
      method: parsed.data.method,
      reference: parsed.data.reference ?? null,
      notes: parsed.data.notes ?? null,
    })
    .select("id, booking_id, invoice_id, amount, received_at, payment_kind, method, reference, notes")
    .single()

  if (error || !payment) return safeSupabaseError("payments:insert", error)

  await Promise.all([
    supabase.from("audit_logs").insert({
      actor: profile.actorName,
      actor_user_id: user.id,
      entity_type: "Payment",
      entity_id: payment.id,
      action: "payment_recorded",
      after_json: {
        amount: payment.amount,
        payment_kind: payment.payment_kind,
        method: payment.method,
        booking_id: payment.booking_id,
        invoice_id: payment.invoice_id,
      },
    }),
    syncBookingPaymentState(supabase, bookingId, {
      actorName: profile.actorName,
      actorUserId: user.id,
    }),
  ])

  return Response.json({
    id: payment.id,
    jobId: payment.booking_id,
    bookingId: payment.booking_id,
    invoiceId: payment.invoice_id,
    amount: payment.amount,
    paymentKind: payment.payment_kind,
    paymentDate: payment.received_at,
    receivedAt: payment.received_at,
    receivedAtDisplay: formatDisplayDateTime(payment.received_at),
    method: payment.method,
    reference: payment.reference,
    notes: payment.notes,
  })
}
