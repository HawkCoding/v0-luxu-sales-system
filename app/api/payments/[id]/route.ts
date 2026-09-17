import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { writeAuditLog } from "@/lib/audit-write"
import { syncBookingPaymentState } from "@/lib/invoices/sync-booking-payment-state"
import { paymentKindSignIssue, type PaymentKind } from "@/lib/payments/payment-validation"
import { getPaymentReferenceRequired } from "@/lib/settings-access"

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

const PAYMENT_ROW_COLUMNS =
  "id, booking_id, invoice_id, amount, received_at, payment_kind, method, reference, notes"

interface PaymentRow {
  id: string
  booking_id: string
  invoice_id: string | null
  amount: number
  received_at: string
  payment_kind: PaymentKind
  method: string
  reference: string | null
  notes: string | null
}

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

  const { data: existing, error: fetchError } = await supabase
    .from("payments")
    .select(PAYMENT_ROW_COLUMNS)
    .eq("id", id)
    .single<PaymentRow>()

  if (fetchError || !existing) return jsonError("Payment not found", 404)

  const effectiveAmount = parsed.data.amount ?? existing.amount
  const signIssue = paymentKindSignIssue(existing.payment_kind, effectiveAmount)
  if (signIssue) return jsonError(signIssue, 400)

  const effectiveReference = parsed.data.reference !== undefined ? parsed.data.reference : existing.reference
  const referenceRequired = await getPaymentReferenceRequired(supabase)
  if (referenceRequired && !effectiveReference?.trim()) {
    return jsonError("Payment reference is required", 400)
  }

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

  const newBookingId = data.booking_id as string
  const oldBookingId = existing.booking_id

  await Promise.all([
    writeAuditLog(supabase, {
      actor: profile.actorName,
      actorUserId: user.id,
      entityType: "Payment",
      entityId: id,
      action: "payment_updated",
      before: {
        amount: existing.amount,
        received_at: existing.received_at,
        method: existing.method,
        reference: existing.reference,
        notes: existing.notes,
        booking_id: existing.booking_id,
      },
      after: {
        amount: data.amount,
        received_at: data.received_at,
        method: data.method,
        reference: data.reference,
        notes: data.notes,
        booking_id: data.booking_id,
      },
    }),
    syncBookingPaymentState(supabase, newBookingId, {
      actorName: profile.actorName,
      actorUserId: user.id,
    }),
    ...(oldBookingId !== newBookingId
      ? [syncBookingPaymentState(supabase, oldBookingId, { actorName: profile.actorName, actorUserId: user.id })]
      : []),
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
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!id) return jsonError("Payment id is required", 400)

  const { supabase, profile, user } = auth.value

  const { data: existing, error: fetchError } = await supabase
    .from("payments")
    .select(PAYMENT_ROW_COLUMNS)
    .eq("id", id)
    .single<PaymentRow>()

  if (fetchError || !existing) return jsonError("Payment not found", 404)

  const { error: deleteError } = await supabase.from("payments").delete().eq("id", id)
  if (deleteError) return safeSupabaseError("payments:delete", deleteError)

  await Promise.all([
    writeAuditLog(supabase, {
      actor: profile.actorName,
      actorUserId: user.id,
      entityType: "Payment",
      entityId: id,
      action: "payment_deleted",
      before: {
        amount: existing.amount,
        payment_kind: existing.payment_kind,
        received_at: existing.received_at,
        method: existing.method,
        reference: existing.reference,
        notes: existing.notes,
        booking_id: existing.booking_id,
        invoice_id: existing.invoice_id,
      },
      after: null,
    }),
    syncBookingPaymentState(supabase, existing.booking_id, {
      actorName: profile.actorName,
      actorUserId: user.id,
    }),
  ])

  return Response.json({ id, deleted: true })
}
