import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { formatDisplayDateTime } from "@/lib/date-format"
import { syncBookingPaymentState } from "@/lib/invoices/sync-booking-payment-state"

const paymentSchema = z
  .object({
    bookingId: z.string().uuid().optional(),
    jobId: z.string().uuid().optional(),
    amount: z.number().refine((v) => Number.isFinite(v) && v !== 0, {
      message: "amount must be non-zero",
    }),
    receivedAt: z.string().datetime({ offset: true }).optional(),
    method: z.string().trim().min(1).max(50),
    reference: z.string().trim().max(120).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => Boolean(v.bookingId ?? v.jobId), {
    message: "bookingId or jobId is required",
    path: ["bookingId"],
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
  const receivedAt = parsed.data.receivedAt ?? new Date().toISOString()

  const { data: payment, error } = await supabase
    .from("payments")
    .insert({
      booking_id: bookingId,
      amount: parsed.data.amount,
      received_at: receivedAt,
      method: parsed.data.method,
      reference: parsed.data.reference ?? null,
      notes: parsed.data.notes ?? null,
    })
    .select("id, booking_id, amount, received_at, method, reference, notes")
    .single()

  if (error || !payment) return safeSupabaseError("payments:insert", error)

  await Promise.all([
    supabase.from("audit_logs").insert({
      actor: profile.actorName,
      actor_user_id: user.id,
      entity_type: "Payment",
      entity_id: payment.id,
      action: "payment_recorded",
      after_json: { amount: payment.amount, method: payment.method, booking_id: payment.booking_id },
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
    amount: payment.amount,
    receivedAt: payment.received_at,
    receivedAtDisplay: formatDisplayDateTime(payment.received_at),
    method: payment.method,
    reference: payment.reference,
    notes: payment.notes,
  })
}
