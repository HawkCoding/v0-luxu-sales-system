// The one place a booking's stage is allowed to move.
//
// `applyTransition` deliberately does no rule checking — its own doc comment says validation "is
// always called separately, before this" — and for a long time only `PATCH /api/jobs/[id]` honoured
// that. `POST /api/correspondence` and the auto-close cron called it directly, so every
// send-and-move button in the UI moved stages with no gates at all: a QA run was refused
// `deposit_paid` by the pipeline board (no payment recorded) and then achieved the same move one
// call later through a correspondence send. The gate system was advisory.
//
// This module packages the three steps that have to happen together — load the evidence the gates
// read, run the gates, then apply and record — so a caller cannot accidentally take only the third.

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, Json } from "@/lib/supabase/types"
import type { PipelineStage } from "@/lib/types"
import { applyTransition, StaleTransitionError, type ApplyTransitionInput } from "./apply-transition"
import { loadTransitionLegReferences } from "./transition-leg-references"
import {
  validateTransition,
  type GateFailure,
  type LostContext,
  type ManualConfirmations,
  type TransitionBooking,
  type TransitionCorrespondence,
  type TransitionCustomer,
  type TransitionDocument,
  type TransitionInvoice,
  type TransitionLegReference,
  type TransitionPayment,
} from "./validate-transition"

/**
 * Everything the gates read about a booking, loaded in one round trip.
 *
 * Gathered here rather than per caller because the omissions were the bug: correspondence's
 * partial pre-send check loaded only `quotes`, so the `deposit_received_confirmation` gate — which
 * reads `payments` — could never fire no matter which stage was requested.
 */
export interface TransitionContext {
  customer: TransitionCustomer | null
  /** The DB row subset, not `TransitionQuote`: it satisfies the validator's shape and is also
   * exactly what `applyTransition` needs to promote a sent quote to accepted. */
  quotes: Pick<Database["public"]["Tables"]["quotes"]["Row"], "id" | "status" | "total" | "created_at">[]
  documents: Pick<Database["public"]["Tables"]["documents"]["Row"], "id" | "kind" | "status" | "created_at">[]
  invoices: TransitionInvoice[]
  correspondences: Pick<
    Database["public"]["Tables"]["correspondences"]["Row"],
    "id" | "kind" | "subject" | "status" | "created_at"
  >[]
  payments: TransitionPayment[]
  legReferences: TransitionLegReference[]
}

export async function loadTransitionContext(
  supabase: SupabaseClient<Database>,
  input: {
    bookingId: string
    customerId: string | null
    fromStage: PipelineStage
    targetStage: PipelineStage
  },
): Promise<TransitionContext> {
  const { bookingId, customerId, fromStage, targetStage } = input

  const [
    { data: customer },
    { data: quotes },
    { data: documents },
    { data: invoices },
    { data: correspondences },
    { data: payments },
  ] = await Promise.all([
    customerId
      ? supabase
          .from("customers")
          .select("first_name, last_name, email, phone, country")
          .eq("id", customerId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("quotes")
      .select("id, status, total, created_at")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: false }),
    supabase.from("documents").select("id, kind, status, created_at").eq("booking_id", bookingId),
    supabase.from("invoices").select("id, kind, status").eq("booking_id", bookingId),
    supabase.from("correspondences").select("id, kind, subject, status, created_at").eq("booking_id", bookingId),
    supabase.from("payments").select("amount").eq("booking_id", bookingId),
  ])

  // Fails open: the generate/send readiness check still blocks a voucher with missing references,
  // so a lookup hiccup here costs a clearer message, never a wrongly-permitted move.
  let legReferences: TransitionLegReference[] = []
  try {
    legReferences = await loadTransitionLegReferences(supabase, bookingId, fromStage, targetStage)
  } catch (error) {
    console.error("pipeline:leg-references", error)
  }

  return {
    customer: customer ?? null,
    quotes: quotes ?? [],
    documents: documents ?? [],
    invoices: invoices ?? [],
    correspondences: correspondences ?? [],
    payments: payments ?? [],
    legReferences,
  }
}

export interface GateDecision {
  failures: GateFailure[]
  /** Deliberate product decision (#122): any authenticated role may override. The control is the
   * audit trail, not a role gate. */
  canOverride: boolean
  /** True when the move must not proceed — gates failed and the caller did not override. */
  blocked: boolean
  /** True when the caller overrode real failures, so the bypass has to be audited. */
  overriding: boolean
}

/**
 * Runs the gates and says what the caller may do. Split from the apply step so a route that sends
 * an email as part of the move can check first and send second — a blocked move must not leave a
 * "your deposit is confirmed" email behind it.
 */
export function decideGatedTransition(input: {
  booking: TransitionBooking
  customer: TransitionCustomer | null
  targetStage: PipelineStage
  context: TransitionContext
  manualConfirmations?: ManualConfirmations
  lostContext?: LostContext
  override?: boolean
}): GateDecision {
  const failures = validateTransition({
    booking: input.booking,
    customer: input.customer,
    targetStage: input.targetStage,
    quotes: input.context.quotes,
    documents: input.context.documents,
    invoices: input.context.invoices,
    correspondences: input.context.correspondences,
    payments: input.context.payments,
    legReferences: input.context.legReferences,
    manualConfirmations: input.manualConfirmations,
    lostContext: input.lostContext,
  })

  // `override: true` sent alongside a clean transition is a no-op, not a bypass — so there is
  // nothing to demand a reason for and nothing to audit.
  const overriding = input.override === true && failures.length > 0
  return {
    failures,
    canOverride: true,
    blocked: input.override !== true && failures.length > 0,
    overriding,
  }
}

export type GatedTransitionResult =
  | { ok: true; updated: Database["public"]["Tables"]["bookings"]["Row"]; crossedStages: PipelineStage[] }
  | { ok: false; reason: "stale"; currentUpdatedAt: string }
  | { ok: false; reason: "error"; error: unknown; step: "apply" | "history" | "audit" }

/**
 * Applies a transition the gates have already cleared, and records it: pipeline_history, the
 * `stage_change` audit row, and — only for a real bypass — the `stage_change_override` row carrying
 * the reason and the gates it skipped.
 *
 * Callers must pass the `GateDecision` they got from `decideGatedTransition`, which is what makes
 * "apply without validating" awkward to write by accident.
 */
export async function applyGatedTransition(
  supabase: SupabaseClient<Database>,
  input: {
    booking: ApplyTransitionInput["booking"]
    targetStage: PipelineStage
    actorName: string
    actorUserId: string | null
    decision: GateDecision
    context: TransitionContext
    overrideReason?: string
    departureDate?: string | null
    durationNights?: number | null
    expectedUpdatedAt?: string
    manualConfirmations?: ManualConfirmations
    lostContext?: LostContext
  },
): Promise<GatedTransitionResult> {
  const fromStage = input.booking.stage as PipelineStage
  const { targetStage, actorName, actorUserId, decision, context } = input

  let updated: Database["public"]["Tables"]["bookings"]["Row"]
  let crossedStages: PipelineStage[]
  try {
    const transition = await applyTransition(supabase, {
      booking: input.booking,
      departureDate: input.departureDate,
      durationNights: input.durationNights,
      targetStage,
      actorName,
      actorUserId,
      expectedUpdatedAt: input.expectedUpdatedAt,
      manualConfirmations: input.manualConfirmations,
      lostContext: input.lostContext,
      quotes: context.quotes,
      documents: context.documents,
      correspondences: context.correspondences,
    })
    updated = transition.updated
    crossedStages = transition.crossedStages
  } catch (error) {
    if (error instanceof StaleTransitionError) {
      return { ok: false, reason: "stale", currentUpdatedAt: error.currentUpdatedAt }
    }
    return { ok: false, reason: "error", error, step: "apply" }
  }

  const historyInsert = await supabase.from("pipeline_history").insert({
    booking_id: input.booking.id,
    from_stage: fromStage,
    to_stage: targetStage,
    moved_by: actorName,
    moved_by_user_id: actorUserId,
  })
  if (historyInsert.error) {
    return { ok: false, reason: "error", error: historyInsert.error, step: "history" }
  }

  const stageAudit = await supabase.from("audit_logs").insert({
    actor: actorName,
    actor_user_id: actorUserId,
    entity_type: "Booking",
    entity_id: input.booking.id,
    action: "stage_change",
    before_json: { stage: fromStage },
    after_json: { stage: targetStage },
    meta_json: {
      payments_seen: context.payments.length,
      manual_confirmations: input.manualConfirmations ?? null,
    } as Json,
  })
  if (stageAudit.error) {
    return { ok: false, reason: "error", error: stageAudit.error, step: "audit" }
  }

  if (decision.overriding) {
    const overrideAudit = await supabase.from("audit_logs").insert({
      actor: actorName,
      actor_user_id: actorUserId,
      entity_type: "Booking",
      entity_id: input.booking.id,
      action: "stage_change_override",
      before_json: { stage: fromStage, gates_failed: decision.failures.map((failure) => failure.gateId) },
      after_json: { stage: targetStage },
      override_reason: input.overrideReason ?? "",
      overridden_by: actorUserId,
      meta_json: {
        failures: decision.failures.map((failure) => ({
          gateId: failure.gateId,
          message: failure.message,
          fixHint: failure.fixHint,
          severity: failure.severity,
          autoFixable: failure.autoFixable ?? null,
        })),
      } as Json,
    })
    if (overrideAudit.error) {
      return { ok: false, reason: "error", error: overrideAudit.error, step: "audit" }
    }
  }

  return { ok: true, updated, crossedStages }
}
