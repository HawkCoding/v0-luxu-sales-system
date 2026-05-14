import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { syncBookingPaymentState } from "@/lib/invoices/sync-booking-payment-state"

const paymentPatchSchema = z
  .object({
    bookingId: z.string().uuid().optional(),
    jobId: z.string().uuid().optional(),
    amount: z.number().refine((v) => Number.isFinite(v) && v !== 0).optional(),
    receivedAt: z.string().datetime({ offset: true }).optional(),
    method: z.string().trim().min(1).max(50).optional(),
    reference: z.string().trim().max(120).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Body must include at least one field" })

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!id) return jsonError("Payment id is required", 400)

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = paymentPatchSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)

  const { supabase, profile, user } = auth.value

  // Fetch current state for audit before/after
  const { data: before, error: fetchError } = await supabase
    .from("payments")
    .select("id, booking_id, amount, received_at, method, reference, notes")
    .eq("id", id)
    .single()

  if (fetchError || !before) return jsonError("Payment not found", 404)

  const updates: Record<string, unknown> = {}
  if (parsed.data.bookingId !== undefined) updates.booking_id = parsed.data.bookingId
  if (parsed.data.jobId !== undefined) updates.booking_id = parsed.data.jobId
  if (parsed.data.amount !== undefined) updates.amount = parsed.data.amount
  if (parsed.data.receivedAt !== undefined) updates.received_at = parsed.data.receivedAt
  if (parsed.data.method !== undefined) updates.method = parsed.data.method
  if (parsed.data.reference !== undefined) updates.reference = parsed.data.reference
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes

  const { data, error } = await supabase
    .from("payments")
    .update(updates)
    .eq("id", id)
    .select("id, booking_id, amount, received_at, method, reference, notes")
    .single()

  if (error || !data) return safeSupabaseError("payments:update", error)

  const bookingId = (updates.booking_id as string | undefined) ?? before.booking_id

  await Promise.all([
    supabase.from("audit_logs").insert({
      actor: profile.actorName,
      actor_user_id: user.id,
      entity_type: "Payment",
      entity_id: id,
      action: "payment_updated",
      before_json: { amount: before.amount, method: before.method, booking_id: before.booking_id },
      after_json: { amount: data.amount, method: data.method, booking_id: data.booking_id },
    }),
    syncBookingPaymentState(supabase, bookingId, {
      actorName: profile.actorName,
      actorUserId: user.id,
    }),
  ])

  return Response.json({
    id: data.id,
    bookingId: data.booking_id,
    jobId: data.booking_id,
    amount: data.amount,
    receivedAt: data.received_at,
    method: data.method,
    reference: data.reference,
    notes: data.notes,
  })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Deletion is manager-restricted — consultants can record but not delete
  const auth = await requireRole(["admin", "manager"])
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!id) return jsonError("Payment id is required", 400)

  const { supabase, profile, user } = auth.value

  const { data: payment, error: fetchError } = await supabase
    .from("payments")
    .select("id, booking_id, amount, method, reference")
    .eq("id", id)
    .single()

  if (fetchError || !payment) return jsonError("Payment not found", 404)

  const { error: deleteError } = await supabase.from("payments").delete().eq("id", id)

  if (deleteError) return safeSupabaseError("payments:delete", deleteError)

  await Promise.all([
    supabase.from("audit_logs").insert({
      actor: profile.actorName,
      actor_user_id: user.id,
      entity_type: "Payment",
      entity_id: id,
      action: "payment_deleted",
      before_json: {
        amount: payment.amount,
        method: payment.method,
        reference: payment.reference,
        booking_id: payment.booking_id,
      },
    }),
    syncBookingPaymentState(supabase, payment.booking_id, {
      actorName: profile.actorName,
      actorUserId: user.id,
    }),
  ])

  return new Response(null, { status: 204 })
}
