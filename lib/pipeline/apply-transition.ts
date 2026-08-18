import type { SupabaseClient } from "@supabase/supabase-js"
import { writeAuditLog } from "@/lib/audit-write"
import { syncBookingPaymentState } from "@/lib/invoices/sync-booking-payment-state"
import type { Database } from "@/lib/supabase/types"
import type { PipelineStage } from "@/lib/types"
import {
  getCrossedForwardStages,
  isReopenFromCancelled,
  type LostContext,
  type ManualConfirmations,
} from "./validate-transition"

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"]
type BookingUpdate = Database["public"]["Tables"]["bookings"]["Update"]
type QuoteRow = Database["public"]["Tables"]["quotes"]["Row"]
type DocumentRow = Database["public"]["Tables"]["documents"]["Row"]
type CorrespondenceRow = Database["public"]["Tables"]["correspondences"]["Row"]

export interface ApplyTransitionInput {
  booking: Pick<
    BookingRow,
    | "id"
    | "booking_number"
    | "stage"
    | "source"
    | "raw_text"
    | "updated_at"
    | "customer_id"
    | "consultant"
  > & {
    /**
     * Optional so existing callers building this Pick literal don't all need
     * updating. Used only to pick a signature sender for the deposit-request
     * draft this transition composes — falls back to actorUserId when absent.
     */
    assigned_salesperson_id?: string | null
  }
  departureDate?: string | null
  durationNights?: number | null
  targetStage: PipelineStage
  actorName: string
  actorUserId: string | null
  expectedUpdatedAt?: string
  manualConfirmations?: ManualConfirmations
  lostContext?: LostContext
  quotes?: Pick<QuoteRow, "id" | "status" | "total" | "created_at">[]
  documents?: Pick<DocumentRow, "id" | "kind" | "status">[]
  correspondences?: Pick<CorrespondenceRow, "id" | "kind" | "subject" | "status">[]
  now?: Date
}

/** Thrown when a concurrent write beat us to the guarded update; carries the
 *  fresh `updated_at` so the caller can surface a proper conflict response
 *  instead of leaking a raw Postgrest error to the client. */
export class StaleTransitionError extends Error {
  constructor(public currentUpdatedAt: string) {
    super("Booking was modified by another user since this transition started")
  }
}

export interface ApplyTransitionResult {
  updated: BookingRow
  crossedStages: PipelineStage[]
}

function newestAcceptedOrSentQuote(
  quotes: Pick<QuoteRow, "id" | "status" | "total" | "created_at">[],
): Pick<QuoteRow, "id" | "status" | "total" | "created_at"> | null {
  const candidates = quotes.filter((quote) => quote.status === "accepted" || quote.status === "sent")
  if (candidates.length === 0) return null

  return candidates.sort((left, right) => {
    const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0
    const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0
    return rightTime - leftTime
  })[0] ?? null
}

function buildBookingUpdates(input: ApplyTransitionInput, nowIso: string): BookingUpdate {
  const updates: BookingUpdate = {
    stage: input.targetStage,
    updated_at: nowIso,
  }
  const crossedStages = getCrossedForwardStages(input.booking.stage as PipelineStage, input.targetStage)

  if (crossedStages.includes("quote_sent")) updates.quote_sent_at = nowIso
  if (crossedStages.includes("accepted")) updates.accepted_at = nowIso
  if (crossedStages.includes("deposit_requested")) updates.deposit_requested_at = nowIso
  if (crossedStages.includes("deposit_paid")) {
    updates.deposit_paid_at = nowIso
    updates.deposit_paid = true
    updates.deposit_confirmed_manually = true
  }
  if (crossedStages.includes("final_paid")) {
    updates.final_paid_at = nowIso
    updates.invoice_balance = 0
  }
  if (crossedStages.includes("voucher_sent")) {
    updates.voucher_sent_at = nowIso
    // Auto-set outcome to Won when voucher is sent (booking is complete)
    updates.outcome = "Won"
    updates.outcome_set_at = nowIso
  }
  if (crossedStages.includes("closed")) updates.closed_at = nowIso

  if (input.targetStage === "lost") {
    updates.cancelled_at = nowIso
    updates.refund_status = input.lostContext?.refundStatus ?? null
    updates.refund_amount = input.lostContext?.refundAmount ?? null
    updates.refund_reference = input.lostContext?.refundReference?.trim() || null
    updates.refunded_at = input.lostContext?.refundedAt || null
  } else if (isReopenFromCancelled(input.booking.stage as PipelineStage)) {
    // Reopening has to undo the cancellation, or the booking lands in states
    // like `stage=accepted, outcome=Cancelled, cancelled_at=<set>`. The reason
    // and notes are cleared with it; the reopen itself is what the audit log
    // now records.
    updates.cancelled_at = null
    updates.outcome = "Open"
    updates.outcome_reason_id = null
    updates.outcome_notes = null
    updates.outcome_set_at = null
    updates.outcome_set_by = null
    updates.refund_status = null
    updates.refund_amount = null
    updates.refund_reference = null
    updates.refunded_at = null
  }

  if (input.booking.source === "email" && input.targetStage !== "enquiry") {
    updates.raw_text = null
  }

  return updates
}

export async function applyTransition(
  supabase: SupabaseClient<Database>,
  input: ApplyTransitionInput,
): Promise<ApplyTransitionResult> {
  const nowIso = (input.now ?? new Date()).toISOString()
  const crossedStages = getCrossedForwardStages(input.booking.stage as PipelineStage, input.targetStage)
  const updates = buildBookingUpdates(input, nowIso)

  // Every transition is guarded, not only the ones whose caller sent a stamp.
  // `expectedUpdatedAt` used to be the only thing that engaged the check, and
  // it is optional on the PATCH schema, so two concurrent moves (a double
  // click, a retry, two tabs) both applied: two pipeline_history rows, two
  // invoice_pdf documents, two deposit emails queued. The caller's stamp still
  // wins when it sends one; otherwise the row version we just read serialises
  // the write, and the loser gets the same 409 as an explicitly stale save.
  const guardUpdatedAt = input.expectedUpdatedAt ?? input.booking.updated_at

  const { data: updated, error } = await supabase
    .from("bookings")
    .update(updates)
    .eq("id", input.booking.id)
    .eq("updated_at", guardUpdatedAt)
    .select()
    .maybeSingle()
  if (error) throw error
  if (!updated) {
    const { data: current } = await supabase
      .from("bookings")
      .select("updated_at")
      .eq("id", input.booking.id)
      .maybeSingle()
    if (!current) throw new Error("Booking update did not return a row")
    throw new StaleTransitionError(current.updated_at ?? input.booking.updated_at)
  }

  const latestQuote = newestAcceptedOrSentQuote(input.quotes ?? [])

  if (crossedStages.includes("accepted") && latestQuote?.status === "sent") {
    const { error: quoteError } = await supabase
      .from("quotes")
      .update({ status: "accepted", updated_at: nowIso })
      .eq("id", latestQuote.id)

    if (quoteError) throw new Error(quoteError.message)

    // Recompute invoice_balance/deposit_paid off the newly-accepted quote total so a
    // revised (e.g. higher) total is reflected immediately, not just on the next payment.
    await syncBookingPaymentState(supabase, input.booking.id, {
      actorName: input.actorName,
      actorUserId: input.actorUserId,
    })
  }

  if (crossedStages.includes("deposit_paid")) {
    await writeAuditLog(supabase, {
      actor: input.actorName,
      actorUserId: input.actorUserId,
      entityType: "Booking",
      entityId: input.booking.id,
      action: "booking_confirmed",
      before: { stage: input.booking.stage, deposit_paid: false },
      after: { stage: input.targetStage, deposit_paid: true, deposit_paid_at: updates.deposit_paid_at ?? nowIso },
    })
  }

  if (crossedStages.includes("deposit_requested")) {
    // No invoice is created here any more. The `invoice_document` gate is a
    // hard block that can only be cleared by generating a real invoice through
    // POST /api/invoices/deposit, and `invoice_correspondence` then blocks
    // until it is actually sent — so by the time this runs, both the invoice
    // and its email already exist. The placeholder `invoice_pdf` document and
    // the draft deposit email this branch used to write were the tail end of
    // the removed `create_invoice_25pct` shortcut.
    const invoiceBalance = latestQuote?.total ?? null
    if (invoiceBalance !== null && updated.invoice_balance === null) {
      const { error: balanceError } = await supabase
        .from("bookings")
        .update({ invoice_balance: invoiceBalance })
        .eq("id", input.booking.id)

      if (balanceError) throw new Error(balanceError.message)
    }
  }

  if (crossedStages.includes("voucher_sent")) {
    const { error: voucherError } = await supabase
      .from("documents")
      .update({ status: "sent" })
      .eq("booking_id", input.booking.id)
      .eq("kind", "voucher_pdf")

    if (voucherError) throw new Error(voucherError.message)

    await writeAuditLog(supabase, {
      actor: input.actorName,
      actorUserId: input.actorUserId,
      entityType: "Booking",
      entityId: input.booking.id,
      action: "outcome_auto_set_won",
      before: { outcome: "Open" },
      after: { outcome: "Won", outcome_set_at: nowIso },
    })

    if (input.booking.customer_id) {
      const { data: completedBookings, error: completedBookingsError } = await supabase
        .from("bookings")
        .select("departure_date")
        .eq("customer_id", input.booking.customer_id)
        .in("stage", ["voucher_sent", "closed"])
        .not("departure_date", "is", null)

      if (completedBookingsError) throw new Error(completedBookingsError.message)

      const travelDates = (completedBookings ?? [])
        .map((booking) => booking.departure_date)
        .filter((departureDate): departureDate is string => Boolean(departureDate))
        .sort()

      if (travelDates.length > 0) {
        const { error: customerError } = await supabase
          .from("customers")
          .update({
            first_travel_date: travelDates[0],
            last_travel_date: travelDates[travelDates.length - 1],
          })
          .eq("id", input.booking.customer_id)

        if (customerError) throw new Error(customerError.message)
      }
    }
  }

  return { updated, crossedStages }
}
