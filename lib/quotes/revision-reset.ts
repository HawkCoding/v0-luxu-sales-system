import type { SupabaseClient } from "@supabase/supabase-js"
import { writeAuditLog } from "@/lib/audit-write"
import { FORWARD_STAGES } from "@/lib/pipeline/validate-transition"
import type { Database } from "@/lib/supabase/types"
import { getCanonicalPipelineStage, PIPELINE_STAGE_LABELS, type PipelineStage } from "@/lib/types"

type BookingUpdate = Database["public"]["Tables"]["bookings"]["Update"]

/** Invoice statuses that a revision supersedes. A `paid` invoice is never voided. */
const VOIDABLE_INVOICE_STATUSES = ["draft", "sent"]

/** Paid invoice kinds reopened (set back to `sent`) so the delta can be billed once the revision is accepted. */
const REOPENABLE_INVOICE_KINDS = ["final", "full"]

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
  /** Sum of payment rows on the booking. Any money received floors the reset. */
  totalPaid: number
  outcome?: string | null
}

export interface RevisionResetPlan {
  /** Stage the booking is rewound to. Equal to the current stage when nothing changes. */
  targetStage: PipelineStage
  /** True when money was already received, so the reset stops at Deposit Invoice Sent. */
  keepsDeposit: boolean
  /** Booking timestamp columns this reset clears. */
  clearedFields: string[]
  /** True when unpaid deposit/final invoices will be voided. */
  voidsInvoices: boolean
  /** Human-readable lines for the confirmation dialog. */
  summary: string[]
  /** False when the booking is already at or behind the reset floor. */
  changesStage: boolean
  /** True when the booking had already reached Paid in Full or later — needs explicit confirmation. */
  farAlong: boolean
}

function stageIndex(stage: PipelineStage): number {
  return FORWARD_STAGES.indexOf(getCanonicalPipelineStage(stage))
}

/**
 * Works out how far a quote revision rewinds the booking.
 *
 * A revision starts life as a `draft` quote, so the booking normally returns to
 * Enquiry and the salesperson re-walks send → accept → deposit. Once money has
 * been received the reset stops at Quote Accepted: the payments and the
 * `deposit_paid` flag stay, and the salesperson re-issues an amended invoice at
 * the new total.
 *
 * Both floors sit at or below Quote Accepted on purpose. Crossing `accepted` is
 * the only thing that flips the revised quote from `draft` to `accepted` (see
 * `applyTransition`), and `calculateInvoiceBalance` refuses to price an invoice
 * without an accepted quote — so a floor above `accepted` would strand the
 * booking with a revised quote that can never be billed.
 */
export function planRevisionReset(input: RevisionResetInput): RevisionResetPlan {
  const currentStage = getCanonicalPipelineStage(input.stage)
  const keepsDeposit = input.depositPaid || input.totalPaid > 0
  const floorStage: PipelineStage = keepsDeposit ? "accepted" : "enquiry"

  const currentIndex = stageIndex(currentStage)
  const floorIndex = stageIndex(floorStage)
  // `lost` and other off-ladder stages have no index — leave them alone.
  const changesStage = currentIndex > floorIndex && floorIndex !== -1
  const targetStage = changesStage ? floorStage : currentStage
  const farAlong = currentIndex >= stageIndex("final_paid")

  const clearedFields: string[] = []
  if (changesStage) {
    for (const stage of FORWARD_STAGES.slice(floorIndex + 1, currentIndex + 1)) {
      const column = STAGE_TIMESTAMP_COLUMN[stage]
      if (!column) continue
      // Money received stays on the record: clearing `deposit_paid_at` while
      // `deposit_paid` remains true would contradict itself.
      if (keepsDeposit && column === "deposit_paid_at") continue
      clearedFields.push(column)
    }
    if (!keepsDeposit) {
      clearedFields.push("deposit_paid", "deposit_confirmed_manually", "invoice_balance")
    }
    if (input.outcome === "Won") {
      clearedFields.push("outcome", "outcome_set_at")
    }
  }

  const summary: string[] = []
  if (changesStage) {
    summary.push(
      `Booking moves back from ${PIPELINE_STAGE_LABELS[currentStage]} to ${PIPELINE_STAGE_LABELS[targetStage]}.`,
    )
  } else {
    summary.push(`Booking stays at ${PIPELINE_STAGE_LABELS[currentStage]}.`)
  }
  summary.push("Unpaid deposit and final invoices are voided so a new one can be issued at the revised total.")
  summary.push("The quote being revised is marked Superseded.")
  summary.push("Guest details, reservation details and supplier references are kept as they are.")
  if (keepsDeposit) {
    summary.push("Payments already received are kept — the deposit stays marked as paid.")
  }
  if (farAlong) {
    summary.push(
      `This booking already reached ${PIPELINE_STAGE_LABELS[currentStage]} — any paid invoice is reopened ` +
        "so the new balance can be billed once this revision is accepted.",
    )
  }
  if (changesStage) {
    summary.push(
      "You then re-walk three steps: send the revised quote, move the booking to Quote Accepted, " +
        "and issue the amended invoice (you can switch between deposit and full payment again).",
    )
  }

  return {
    targetStage,
    keepsDeposit,
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
  now?: Date
}

export interface ApplyRevisionResetResult {
  voidedInvoiceIds: string[]
  reopenedInvoiceIds: string[]
  stageChanged: boolean
}

/**
 * Applies a {@link planRevisionReset} result: rewinds the booking, voids unpaid
 * invoices, supersedes the parent quote, and writes the audit trail.
 */
export async function applyRevisionReset(
  supabase: SupabaseClient<Database>,
  input: ApplyRevisionResetInput,
): Promise<ApplyRevisionResetResult> {
  const nowIso = (input.now ?? new Date()).toISOString()
  const { plan } = input

  if (plan.changesStage) {
    const updates: BookingUpdate = { stage: plan.targetStage, updated_at: nowIso }

    for (const field of plan.clearedFields) {
      if (field === "deposit_paid") updates.deposit_paid = false
      else if (field === "deposit_confirmed_manually") updates.deposit_confirmed_manually = false
      else if (field === "outcome") updates.outcome = "Open"
      else (updates as Record<string, unknown>)[field] = null
    }

    const { error } = await supabase.from("bookings").update(updates).eq("id", input.bookingId)
    if (error) throw new Error(error.message)
  }

  const { data: voided, error: voidError } = await supabase
    .from("invoices")
    .update({ status: "void", updated_at: nowIso })
    .eq("booking_id", input.bookingId)
    .in("status", VOIDABLE_INVOICE_STATUSES)
    .select("id")

  if (voidError) throw new Error(voidError.message)

  // A paid final/full invoice is never voided (see VOIDABLE_INVOICE_STATUSES), but it
  // must be reopened so the new balance can be billed once the revision is accepted.
  const { data: reopened, error: reopenError } = await supabase
    .from("invoices")
    .update({ status: "sent", updated_at: nowIso })
    .eq("booking_id", input.bookingId)
    .in("kind", REOPENABLE_INVOICE_KINDS)
    .eq("status", "paid")
    .select("id")

  if (reopenError) throw new Error(reopenError.message)

  const { error: supersedeError } = await supabase
    .from("quotes")
    .update({ status: "superseded", updated_at: nowIso })
    .eq("id", input.parentQuoteId)

  if (supersedeError) throw new Error(supersedeError.message)

  const voidedInvoiceIds = (voided ?? []).map((invoice) => invoice.id)
  const reopenedInvoiceIds = (reopened ?? []).map((invoice) => invoice.id)

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
      reopened_invoice_ids: reopenedInvoiceIds,
      superseded_quote_id: input.parentQuoteId,
      kept_deposit: plan.keepsDeposit,
    },
  })

  return { voidedInvoiceIds, reopenedInvoiceIds, stageChanged: plan.changesStage }
}
