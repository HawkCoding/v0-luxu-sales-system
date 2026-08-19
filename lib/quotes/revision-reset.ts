import type { SupabaseClient } from "@supabase/supabase-js"
import { writeAuditLog } from "@/lib/audit-write"
import { StaleTransitionError } from "@/lib/pipeline/apply-transition"
import { FORWARD_STAGES } from "@/lib/pipeline/validate-transition"
import type { Database } from "@/lib/supabase/types"
import { getCanonicalPipelineStage, PIPELINE_STAGE_LABELS, type PipelineStage } from "@/lib/types"

type BookingUpdate = Database["public"]["Tables"]["bookings"]["Update"]

/**
 * Invoice statuses a revision voids. Unlike the old floor-at-`accepted` reset, `paid`
 * is included: the floor is always Enquiry now, so an invoice paid against the
 * superseded total is never still-correct — it gets voided like everything else and
 * re-issued once the revised quote is accepted. Payment rows themselves are never
 * touched; they stay as history and the balance recomputes off them.
 */
const VOIDABLE_INVOICE_STATUSES = ["draft", "sent", "paid"]

/** Timestamp column cleared when the stage it records is rewound past. */
const STAGE_TIMESTAMP_COLUMN: Partial<Record<PipelineStage, keyof BookingUpdate>> = {
  quote_sent: "quote_sent_at",
  accepted: "accepted_at",
  deposit_requested: "deposit_requested_at",
  deposit_paid: "deposit_paid_at",
  final_paid: "final_paid_at",
  voucher_sent: "voucher_sent_at",
  closed: "closed_at",
}

export interface RevisionResetInput {
  stage: PipelineStage
  /** True once the deposit has been received or manually confirmed. */
  depositPaid: boolean
  /** Sum of payment rows on the booking. Kept as history regardless; only used to flag `farAlong`. */
  totalPaid: number
  outcome?: string | null
}

export interface RevisionResetPlan {
  /** Stage the booking is rewound to. Equal to the current stage when nothing changes. */
  targetStage: PipelineStage
  /** Booking timestamp columns this reset clears. */
  clearedFields: string[]
  /** True — every revision voids the booking's invoices so a new one is issued at the revised total. */
  voidsInvoices: boolean
  /** Human-readable lines for the confirmation dialog. */
  summary: string[]
  /** False when the booking is already at Enquiry. */
  changesStage: boolean
  /** True when money had already been received — needs explicit confirmation since it un-marks the deposit as paid. */
  farAlong: boolean
}

function stageIndex(stage: PipelineStage): number {
  return FORWARD_STAGES.indexOf(getCanonicalPipelineStage(stage))
}

/**
 * Works out how far a quote revision rewinds the booking.
 *
 * The floor is always Enquiry, full stop. A revision starts life as a `draft`
 * quote, and the whole point of the revise flow is that the salesperson
 * re-walks every step — send, accept, reservation form, deposit, invoice —
 * against the revised numbers rather than trusting stale gate state left over
 * from before. Payments already received are never deleted (they're real
 * money, kept as history and folded back into the balance once the revised
 * quote is accepted), but every *derived* flag that depended on the old total
 * — deposit_paid, the invoice, the reservation-form tick, the outcome — is
 * cleared so none of the pipeline gates auto-pass on the way back up.
 */
export function planRevisionReset(input: RevisionResetInput): RevisionResetPlan {
  const currentStage = getCanonicalPipelineStage(input.stage)
  const floorStage: PipelineStage = "enquiry"

  const currentIndex = stageIndex(currentStage)
  const floorIndex = stageIndex(floorStage)
  // `lost` and other off-ladder stages have no index — leave them alone.
  const changesStage = currentIndex > floorIndex && floorIndex !== -1
  const targetStage = changesStage ? floorStage : currentStage
  const hadMoney = input.depositPaid || input.totalPaid > 0
  const farAlong = hadMoney || currentIndex >= stageIndex("final_paid")

  const clearedFields: string[] = []
  if (changesStage) {
    for (const stage of FORWARD_STAGES.slice(floorIndex + 1, currentIndex + 1)) {
      const column = STAGE_TIMESTAMP_COLUMN[stage]
      if (column) clearedFields.push(column)
    }
    clearedFields.push(
      "deposit_paid",
      "deposit_confirmed_manually",
      "invoice_balance",
      "reservation_form_received_at",
    )
    if (input.outcome === "Won") {
      clearedFields.push("outcome", "outcome_set_at")
    }
  }

  const summary: string[] = []
  if (changesStage) {
    summary.push(`Booking moves back from ${PIPELINE_STAGE_LABELS[currentStage]} to Enquiry.`)
  } else {
    summary.push("Booking stays at Enquiry.")
  }
  summary.push("Every invoice on the booking is voided so a new one can be issued at the revised total.")
  summary.push("The quote being revised is marked Superseded.")
  summary.push("Guest details, reservation details and supplier references are kept as they are.")
  if (hadMoney) {
    summary.push(
      "Payments already received are kept on record, but the deposit is no longer marked as paid — " +
        "the balance recalculates once the revised quote is accepted and a new invoice is issued.",
    )
  }
  summary.push("The signed reservation form must be received again before the revised quote can be accepted.")
  if (changesStage) {
    summary.push(
      "You then re-walk the sales steps: send the revised quote, receive the reservation form, " +
        "move the booking to Quote Accepted, and issue the invoice (you can switch between deposit " +
        "and full payment again).",
    )
  }

  return {
    targetStage,
    clearedFields,
    voidsInvoices: true,
    summary,
    changesStage,
    farAlong,
  }
}

export interface ApplyRevisionResetInput {
  bookingId: string
  /** The quote being revised — marked superseded. */
  parentQuoteId: string
  plan: RevisionResetPlan
  fromStage: PipelineStage
  actorName: string
  actorUserId: string | null
  /** The booking's `updated_at` as last read. Guards the update against a concurrent write. */
  expectedUpdatedAt: string
  now?: Date
}

export interface ApplyRevisionResetResult {
  voidedInvoiceIds: string[]
  cancelledFollowUpIds: string[]
  stageChanged: boolean
}

/**
 * Applies a {@link planRevisionReset} result: rewinds the booking, voids every
 * invoice, cancels the quote's scheduled follow-up, supersedes the parent
 * quote, and writes the audit trail plus a `pipeline_history` row for the
 * rewind. Throws {@link StaleTransitionError} if the booking changed under us
 * since it was read — same guard `applyTransition` uses for a normal move.
 */
export async function applyRevisionReset(
  supabase: SupabaseClient<Database>,
  input: ApplyRevisionResetInput,
): Promise<ApplyRevisionResetResult> {
  const nowIso = (input.now ?? new Date()).toISOString()
  const { plan } = input

  if (plan.changesStage) {
    const updates: BookingUpdate = {
      stage: plan.targetStage,
      updated_at: nowIso,
      revision_reset_at: nowIso,
    }

    for (const field of plan.clearedFields) {
      if (field === "deposit_paid") updates.deposit_paid = false
      else if (field === "deposit_confirmed_manually") updates.deposit_confirmed_manually = false
      else if (field === "outcome") updates.outcome = "Open"
      else (updates as Record<string, unknown>)[field] = null
    }

    const { data: updated, error } = await supabase
      .from("bookings")
      .update(updates)
      .eq("id", input.bookingId)
      .eq("updated_at", input.expectedUpdatedAt)
      .select("id")
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!updated) {
      const { data: current } = await supabase
        .from("bookings")
        .select("updated_at")
        .eq("id", input.bookingId)
        .maybeSingle()
      throw new StaleTransitionError(current?.updated_at ?? input.expectedUpdatedAt)
    }

    const { error: historyError } = await supabase.from("pipeline_history").insert({
      booking_id: input.bookingId,
      from_stage: input.fromStage,
      to_stage: plan.targetStage,
      moved_by: input.actorName,
      moved_by_user_id: input.actorUserId,
    })
    if (historyError) throw new Error(historyError.message)
  }

  // Every invoice on the booking was priced off the superseded quote — void it
  // regardless of status (draft, sent, or already paid) so a fresh one is
  // issued at the revised total. Payment rows are never touched.
  const { data: voided, error: voidError } = await supabase
    .from("invoices")
    .update({ status: "void", updated_at: nowIso })
    .eq("booking_id", input.bookingId)
    .in("status", VOIDABLE_INVOICE_STATUSES)
    .select("id")

  if (voidError) throw new Error(voidError.message)

  // The 48h quote_follow_up drafted by the last send of the superseded quote
  // would otherwise still fire, nudging the customer about numbers that no
  // longer apply.
  const { data: cancelledFollowUps, error: followUpError } = await supabase
    .from("correspondences")
    .update({ status: "cancelled" })
    .eq("booking_id", input.bookingId)
    .eq("kind", "quote_follow_up")
    .eq("status", "scheduled")
    .select("id")

  if (followUpError) throw new Error(followUpError.message)

  const { error: supersedeError } = await supabase
    .from("quotes")
    .update({ status: "superseded", updated_at: nowIso })
    .eq("id", input.parentQuoteId)

  if (supersedeError) throw new Error(supersedeError.message)

  const voidedInvoiceIds = (voided ?? []).map((invoice) => invoice.id)
  const cancelledFollowUpIds = (cancelledFollowUps ?? []).map((row) => row.id)

  await writeAuditLog(supabase, {
    actor: input.actorName,
    actorUserId: input.actorUserId,
    entityType: "Booking",
    entityId: input.bookingId,
    action: "quote_revision_reset",
    before: { stage: input.fromStage },
    after: {
      stage: plan.targetStage,
      cleared_fields: plan.clearedFields,
      voided_invoice_ids: voidedInvoiceIds,
      cancelled_follow_up_ids: cancelledFollowUpIds,
      superseded_quote_id: input.parentQuoteId,
    },
  })

  return { voidedInvoiceIds, cancelledFollowUpIds, stageChanged: plan.changesStage }
}
