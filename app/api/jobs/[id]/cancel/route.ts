import { safeSupabaseError } from "@/lib/api/responses"
import { NextResponse } from "next/server"
import { z } from "zod"
import { createSessionClient } from "@/lib/supabase/server"
import { extractRoleFromJwt } from "@/lib/role-utils"
import { writeAuditLog } from "@/lib/audit-write"
import { calculateRefund } from "@/lib/invoices/calculate-refund"
import { calculateDepositAmount, getDefaultDepositPercentage } from "@/lib/pipeline/constants"
import { getDepositRefundable } from "@/lib/settings-access"
import { syncBookingPaymentState } from "@/lib/invoices/sync-booking-payment-state"

const REFUND_REQUIRED_FROM = new Set([
  "deposit_paid",
  "final_paid",
  "voucher_sent",
  "closed",
  "trip_active",
])

const cancelSchema = z.object({
  outcomeReasonId: z.string().uuid(),
  outcomeNotes: z.string().max(300).optional(),
  refundStatus: z.enum(["refunded", "not_refunded"]).optional(),
  refundAmount: z.number().min(0).optional(),
  refundReference: z.string().optional(),
  refundedAt: z.string().optional(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSessionClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: z.infer<typeof cancelSchema>
  try {
    body = cancelSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
  }

  const { data: actorProfile } = await supabase
    .from("profiles")
    .select("name, surname, email, clearance_level")
    .eq("user_id", user.id)
    .maybeSingle()

  const role = extractRoleFromJwt(user) ?? actorProfile?.clearance_level ?? null
  if (role === "readonly" || !role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, booking_number, stage, owner_user_id, assigned_salesperson_id, outcome")
    .eq("id", id)
    .maybeSingle()

  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (role === "consultant") {
    const isOwner = booking.owner_user_id === user.id
    const isAssigned = booking.assigned_salesperson_id === user.id
    if (!isOwner && !isAssigned) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const { data: reason } = await supabase
    .from("outcome_reasons")
    .select("id, label, applies_to, active")
    .eq("id", body.outcomeReasonId)
    .maybeSingle()

  if (!reason || !reason.active) {
    return NextResponse.json({ error: "Outcome reason not found or inactive" }, { status: 400 })
  }
  if (reason.applies_to !== "Cancelled" && reason.applies_to !== "Both") {
    return NextResponse.json({ error: "Reason does not apply to Cancelled outcome" }, { status: 400 })
  }
  if (reason.label === "Other" && !body.outcomeNotes?.trim()) {
    return NextResponse.json({ error: "Notes are required when reason is Other" }, { status: 400 })
  }

  const requiresRefund = REFUND_REQUIRED_FROM.has(booking.stage)
  if (requiresRefund && !body.refundStatus) {
    return NextResponse.json({ error: "refundStatus is required for this booking stage" }, { status: 400 })
  }

  // Auto-calculate refund when refundStatus is 'refunded'
  let finalRefundAmount: number | null = null
  let cancellationFee: number | null = null

  if (body.refundStatus === "refunded") {
    const [{ data: paymentsData }, { data: depositInvoice }, { data: fullInvoice }, depositRefundable, defaultDepositPercentage] =
      await Promise.all([
        supabase.from("payments").select("amount").eq("booking_id", id),
        supabase
          .from("invoices")
          .select("amount")
          .eq("booking_id", id)
          .eq("kind", "deposit")
          .in("status", ["draft", "sent", "paid"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        // A full-payment booking never had a separate deposit invoice — fall
        // back to a notional deposit % of the full amount as the
        // non-refundable cancellation fee.
        supabase
          .from("invoices")
          .select("amount")
          .eq("booking_id", id)
          .eq("kind", "full")
          .in("status", ["draft", "sent", "paid"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        getDepositRefundable(supabase),
        getDefaultDepositPercentage(supabase),
      ])

    const totalPaid = (paymentsData ?? []).reduce((sum, p) => sum + Number(p.amount ?? 0), 0)
    const depositAmount = depositInvoice
      ? Number(depositInvoice.amount)
      : fullInvoice
        ? calculateDepositAmount(Number(fullInvoice.amount), defaultDepositPercentage)
        : 0

    const calc = calculateRefund(totalPaid, depositAmount, depositRefundable)
    cancellationFee = calc.cancellationFee
    finalRefundAmount = body.refundAmount ?? calc.suggestedRefund
  } else if (body.refundStatus === "not_refunded") {
    finalRefundAmount = null
  }

  const nowIso = new Date().toISOString()
  const actorName =
    [actorProfile?.name, actorProfile?.surname].filter(Boolean).join(" ").trim() ||
    actorProfile?.email ||
    user.email ||
    "System"

  const { data: updated, error: updateError } = await supabase
    .from("bookings")
    .update({
      stage: "lost",
      cancelled_at: nowIso,
      outcome: "Cancelled",
      outcome_reason_id: body.outcomeReasonId,
      outcome_notes: body.outcomeNotes?.trim() || null,
      outcome_set_at: nowIso,
      outcome_set_by: user.id,
      refund_status: body.refundStatus ?? null,
      refund_amount: body.refundStatus === "refunded" ? finalRefundAmount : null,
      refund_reference: body.refundStatus === "refunded" ? (body.refundReference?.trim() || null) : null,
      refunded_at: body.refundStatus === "refunded" ? (body.refundedAt || null) : null,
      updated_at: nowIso,
    })
    .eq("id", id)
    .select("id, booking_number, stage, updated_at")
    .single()

  if (updateError) return safeSupabaseError("jobs/[id]/cancel", updateError)

  // Insert negative payment row and recalc balance when a refund is issued
  if (body.refundStatus === "refunded" && finalRefundAmount != null && finalRefundAmount > 0) {
    await supabase.from("payments").insert({
      booking_id: id,
      amount: -finalRefundAmount,
      payment_kind: "refund",
      received_at: nowIso,
      captured_by: user.id,
      notes: "Cancellation refund",
    })

    await syncBookingPaymentState(supabase, id, { actorName, actorUserId: user.id })
  }

  await supabase.from("pipeline_history").insert({
    booking_id: id,
    from_stage: booking.stage,
    to_stage: "lost",
    moved_by: actorName,
    moved_by_user_id: user.id,
  })

  await writeAuditLog(supabase, {
    actor: actorName,
    actorUserId: user.id,
    entityType: "Booking",
    entityId: id,
    action: "booking_cancelled",
    before: { stage: booking.stage, outcome: booking.outcome ?? "Open" },
    after: {
      stage: "lost",
      outcome: "Cancelled",
      outcome_reason: reason.label,
      refund_status: body.refundStatus ?? null,
      ...(body.refundStatus === "refunded" && {
        cancellation_fee: cancellationFee,
        refund_amount: finalRefundAmount,
      }),
    },
  })

  return NextResponse.json({ ok: true, updatedAt: updated.updated_at })
}
