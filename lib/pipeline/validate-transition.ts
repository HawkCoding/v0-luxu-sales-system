import type { PipelineStage } from "@/lib/types"

export type GateSeverity = "block" | "confirm"

export type GateAutoFix = "create_voucher_pdf"

export interface GateFailure {
  gateId: string
  message: string
  fixHint: string
  severity: GateSeverity
  autoFixable?: GateAutoFix
  /**
   * Wording for the tick itself on a `confirm` gate. Without it the modal
   * reuses `message` for both the heading and the checkbox, which reads as two
   * demands where there is one.
   */
  confirmLabel?: string
}

export interface TransitionBooking {
  id: string
  stage: PipelineStage
  source?: string | null
  email_import_needs_review?: boolean | null
  email_import_review_resolved_at?: string | null
  reservation_form_received_at?: string | null
  customer_invoice_number?: string | null
  /**
   * Stamped by a quote revision (see `applyRevisionReset`). Documents and
   * correspondences created at or before this timestamp are pre-revision
   * history — they must not silently satisfy the gates below on the re-walk
   * back up the ladder.
   */
  revision_reset_at?: string | null
}

export interface TransitionCustomer {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  country?: string | null
}

export interface TransitionQuote {
  status: string
  total?: number | null
  created_at?: string | null
}

export interface TransitionDocument {
  kind: string
  status?: string | null
  created_at?: string | null
}

export interface TransitionInvoice {
  kind: string
  status?: string | null
}

export interface TransitionPayment {
  amount?: number | null
}

export interface TransitionCorrespondence {
  kind?: string | null
  subject?: string | null
  status?: string | null
  created_at?: string | null
}

/** One leg/trip that prints as its own voucher block, scoped to the accepted quote. */
export interface TransitionLegReference {
  label: string
  supplierReference?: string | null
}

export interface ManualConfirmations {
  finalPaymentReceived?: boolean
}

export interface LostContext {
  cancelReason?: string | null
  refundStatus?: "refunded" | "not_refunded" | null
  refundAmount?: number | null
  refundReference?: string | null
  refundedAt?: string | null
}

export interface ValidateTransitionInput {
  booking: TransitionBooking
  customer: TransitionCustomer | null
  targetStage: PipelineStage
  quotes?: TransitionQuote[]
  documents?: TransitionDocument[]
  invoices?: TransitionInvoice[]
  correspondences?: TransitionCorrespondence[]
  payments?: TransitionPayment[]
  /**
   * Legs on the accepted quote, used only by the `voucher_sent` reference gate. Callers load it
   * lazily (see `loadTransitionLegReferences`) because it is two extra queries that no other
   * stage needs. Omitting it skips the gate — the same generate/send-time readiness check in
   * `lib/voucher/check-readiness.ts` is still the backstop.
   */
  legReferences?: TransitionLegReference[]
  manualConfirmations?: ManualConfirmations
  lostContext?: LostContext
}

const CANONICAL_STAGE: Partial<Record<PipelineStage, PipelineStage>> = {
  quoted: "quote_sent",
  form_done: "accepted",
  payment_schedule: "deposit_requested",
  trip_active: "voucher_sent",
}

export const FORWARD_STAGES: PipelineStage[] = [
  "enquiry",
  "quote_sent",
  "accepted",
  "deposit_requested",
  "deposit_paid",
  "final_paid",
  "voucher_sent",
  "closed",
]

const REFUND_REQUIRED_FROM: PipelineStage[] = ["deposit_paid", "final_paid", "voucher_sent", "closed", "trip_active"]

function canonicalStage(stage: PipelineStage): PipelineStage {
  return CANONICAL_STAGE[stage] ?? stage
}

function stageIndex(stage: PipelineStage): number {
  return FORWARD_STAGES.indexOf(canonicalStage(stage))
}

/**
 * `lost` is the one stage that sits off the ladder, so `stageIndex` returns -1
 * for it. Reopening a cancelled booking used to skip every gate for that
 * reason: `lost -> anything` hit the `fromIndex === -1` bail-out and moved with
 * zero checks, leaving records like
 * `stage=accepted, outcome=Cancelled, cancelled_at=<set>`.
 *
 * A reopen re-enters the ladder from the bottom, so -1 is the right index —
 * it just has to mean "before enquiry" rather than "give up". Every stage from
 * `enquiry` up to and including the target is then crossed, and every gate on
 * it has to hold.
 */
export function isReopenFromCancelled(stage: PipelineStage): boolean {
  return canonicalStage(stage) === "lost"
}

/**
 * True when a booking has reached `stage` or gone past it on the forward ladder — the question
 * "is this booking committed yet?", asked by guards outside the transition system itself (Build
 * Booking refuses to delete legs from `deposit_paid` on, because by then suppliers are booked and
 * the itinerary is contractual).
 *
 * `lost` sits off the ladder and answers false for every target; callers that must also refuse a
 * cancelled booking pair this with `isTerminalPipelineStage`.
 */
export function isAtOrPastStage(stage: PipelineStage, target: PipelineStage): boolean {
  const from = stageIndex(stage)
  const to = stageIndex(target)
  return from !== -1 && to !== -1 && from >= to
}

/**
 * `lost` and `closed` are permanently terminal by product decision (F12-4,
 * 2026-08-21): once a booking is cancelled or closed it stays that way — no
 * reopening, start a fresh enquiry instead. `apply-transition.ts` and the
 * `reopening` branch above still know how to re-enter the ladder from `lost`,
 * but nothing calls that path any more — `app/api/jobs/[id]/route.ts` blocks
 * the move at the API boundary before either function ever runs.
 */
export function isTerminalPipelineStage(stage: PipelineStage): boolean {
  const canonical = canonicalStage(stage)
  return canonical === "lost" || canonical === "closed"
}

/**
 * Compares two stages by their canonical value, so the aliases (`quoted`,
 * `form_done`, `payment_schedule`, `trip_active`) count as the stage they map
 * to rather than as a separate place to move to.
 */
export function isSameStage(left: PipelineStage, right: PipelineStage): boolean {
  return canonicalStage(left) === canonicalStage(right)
}

function isPresent(value: string | null | undefined): boolean {
  return Boolean(value?.trim())
}

function hasDocument(documents: TransitionDocument[], kind: string): boolean {
  return documents.some((document) => document.kind === kind)
}

function subjectIncludes(correspondence: TransitionCorrespondence, terms: string[]): boolean {
  const subject = correspondence.subject?.toLowerCase() ?? ""
  return terms.some((term) => subject.includes(term))
}

function hasCorrespondence(
  correspondences: TransitionCorrespondence[],
  kind: string,
  subjectTerms: string[],
): boolean {
  return correspondences.some(
    (correspondence) =>
      correspondence.kind === kind ||
      subjectIncludes(correspondence, subjectTerms),
  )
}

function hasSentCorrespondence(
  correspondences: TransitionCorrespondence[],
  kind: string,
  subjectTerms: string[],
): boolean {
  return correspondences.some(
    (correspondence) =>
      correspondence.status === "sent" &&
      (correspondence.kind === kind || subjectIncludes(correspondence, subjectTerms)),
  )
}

function hasSubjectCorrespondence(
  correspondences: TransitionCorrespondence[],
  subjectTerms: string[],
): boolean {
  return correspondences.some((correspondence) => subjectIncludes(correspondence, subjectTerms))
}

function customerCompletenessFailure(customer: TransitionCustomer | null): GateFailure | null {
  const missing: string[] = []

  if (!isPresent(customer?.first_name)) missing.push("first name")
  if (!isPresent(customer?.last_name)) missing.push("last name")
  if (!isPresent(customer?.email)) missing.push("email")
  if (!isPresent(customer?.phone)) missing.push("phone")
  if (!isPresent(customer?.country)) missing.push("country")

  if (missing.length === 0) return null

  return {
    gateId: "customer_complete",
    message: `Customer record is missing ${missing.join(", ")}.`,
    fixHint: "Open the customer record and complete the required contact fields.",
    severity: "block",
  }
}

function lostFailures(input: ValidateTransitionInput): GateFailure[] {
  const failures: GateFailure[] = []
  const fromStage = canonicalStage(input.booking.stage)
  const lostContext = input.lostContext

  if (!isPresent(lostContext?.cancelReason)) {
    failures.push({
      gateId: "cancel_reason",
      message: "A cancellation reason is required before moving a booking to Lost.",
      fixHint: "Choose a cancellation reason and add a short note if needed.",
      severity: "block",
    })
  }

  if (REFUND_REQUIRED_FROM.includes(fromStage)) {
    const refundStatus = lostContext?.refundStatus
    const needsRefundDetails =
      !refundStatus ||
      (refundStatus === "refunded" &&
        (lostContext?.refundAmount === null ||
          lostContext?.refundAmount === undefined ||
          lostContext.refundAmount < 0 ||
          !isPresent(lostContext.refundReference) ||
          !isPresent(lostContext.refundedAt)))

    if (needsRefundDetails) {
      failures.push({
        gateId: "refund_capture",
        message: "Refund status and refund details are required for paid bookings.",
        fixHint: "Capture whether the client was refunded, plus amount, reference, and date when applicable.",
        severity: "block",
      })
    }
  }

  return failures
}

export function validateTransition(input: ValidateTransitionInput): GateFailure[] {
  const targetStage = canonicalStage(input.targetStage)

  if (targetStage === "lost") {
    return lostFailures(input)
  }

  const reopening = isReopenFromCancelled(input.booking.stage)
  // -1 means "below enquiry" for a reopen, so every gate on the way up runs.
  const fromIndex = reopening ? -1 : stageIndex(input.booking.stage)
  const toIndex = stageIndex(targetStage)

  if (toIndex === -1 || (!reopening && (fromIndex === -1 || toIndex <= fromIndex))) {
    return []
  }

  const failures: GateFailure[] = []
  const customerFailure = customerCompletenessFailure(input.customer)
  if (customerFailure) failures.push(customerFailure)

  if (
    input.booking.source === "email" &&
    input.booking.email_import_needs_review &&
    !input.booking.email_import_review_resolved_at
  ) {
    failures.push({
      gateId: "email_import_review",
      message: "Imported enquiry needs review before it can advance.",
      fixHint: "Open the booking, review the imported fields, and resolve the review flag.",
      severity: "block",
    })
  }

  const quotes = input.quotes ?? []
  const invoices = input.invoices ?? []
  const payments = input.payments ?? []

  // A revision rewinds the booking so these gates have to be earned again;
  // documents/correspondences from before the reset must not count toward
  // them even though the rows themselves are kept as history.
  const revisionResetAt = input.booking.revision_reset_at
  function afterRevisionReset<T extends { created_at?: string | null }>(rows: T[]): T[] {
    if (!revisionResetAt) return rows
    return rows.filter((row) => Boolean(row.created_at) && row.created_at! > revisionResetAt)
  }
  const documents = afterRevisionReset(input.documents ?? [])
  const correspondences = afterRevisionReset(input.correspondences ?? [])
  const manualConfirmations = input.manualConfirmations ?? {}
  const crossedStages = FORWARD_STAGES.slice(fromIndex + 1, toIndex + 1)
  const hasSentOrAcceptedQuote = quotes.some((quote) => quote.status === "sent" || quote.status === "accepted")

  if (crossedStages.includes("quote_sent") && !hasSentOrAcceptedQuote) {
    failures.push({
      gateId: "quote_sent_required",
      message: "A sent quote is required before moving to Quote Sent.",
      fixHint: "Send a quote from the booking before moving it to Quote Sent.",
      severity: "block",
    })
  }

  if (
    crossedStages.includes("accepted") &&
    !hasSentOrAcceptedQuote &&
    !crossedStages.includes("quote_sent")
  ) {
    failures.push({
      gateId: "quote_sent_or_accepted",
      message: "At least one sent or accepted quote is required before quote acceptance.",
      fixHint: "Send a quote for this job before moving it to Quote Accepted.",
      severity: "block",
    })
  }

  if (crossedStages.includes("accepted") && !input.booking.reservation_form_received_at) {
    failures.push({
      gateId: "reservation_form_received",
      message: "The signed reservation form must be received before quote acceptance.",
      fixHint: "Tick 'Reservation form received' on the Reservation tab and send the acknowledgement.",
      severity: "block",
    })
  }

  if (crossedStages.includes("deposit_requested") && !isPresent(input.booking.customer_invoice_number)) {
    // The salesperson-entered invoice number is what prints on the customer's
    // invoice PDF and emails (and doubles as the bank payment reference), so it
    // must exist before the deposit invoice can be sent.
    failures.push({
      gateId: "invoice_number_required",
      message: "An invoice number is required before sending the deposit invoice.",
      fixHint: "Enter the invoice number in the field at the top of the job.",
      severity: "block",
    })
  }

  if (crossedStages.includes("deposit_requested")) {
    // A full-payment invoice (booking made inside 2 months of departure, or
    // opted into by the salesperson) covers the whole amount in one go and
    // satisfies the deposit-invoice gate the same way a deposit invoice does.
    const hasDepositInvoice = invoices.some(
      (invoice) => (invoice.kind === "deposit" || invoice.kind === "full") && invoice.status !== "void",
    )
    const hasSentDepositInvoice = invoices.some(
      (invoice) =>
        (invoice.kind === "deposit" || invoice.kind === "full") &&
        (invoice.status === "sent" || invoice.status === "paid"),
    )
    const hasInvoiceDocument = hasDocument(documents, "invoice_pdf")
    // Hard block, not a tick-to-confirm. This gate used to offer a
    // `create_invoice_25pct` autofix that inserted an empty `invoice_pdf`
    // document row and nothing else — no `invoices` row, no invoice number, no
    // deposit percentage — while the copy promised a deposit invoice. There is
    // exactly one way to make a real one (the deposit-invoice dialog, backed by
    // POST /api/invoices/deposit), so the gate now sends the user there.
    if (!hasDepositInvoice && !hasInvoiceDocument) {
      failures.push({
        gateId: "invoice_document",
        message: "A deposit invoice is required before requesting the deposit.",
        fixHint: "Generate the deposit invoice on the Invoices tab, preview it, and send it to the customer.",
        severity: "block",
      })
    } else if (
      (hasDepositInvoice || hasInvoiceDocument) &&
      !hasSentDepositInvoice &&
      !hasSentCorrespondence(correspondences, "invoice", ["invoice", "deposit request"])
    ) {
      failures.push({
        gateId: "invoice_correspondence",
        message: "The deposit invoice is ready but hasn't been sent yet.",
        fixHint: "Send it to the customer to continue. This can be overridden with a recorded reason.",
        severity: "block",
      })
    }
  }

  if (crossedStages.includes("deposit_paid") && payments.length === 0) {
    failures.push({
      gateId: "deposit_received_confirmation",
      message: "A payment must be recorded before the deposit can be marked received.",
      fixHint: "Record a payment on the Payments tab, then send the payment confirmation email.",
      severity: "block",
    })
  }

  if (crossedStages.includes("final_paid")) {
    // One-invoice model: the booking's single invoice (deposit or full) is
    // amended in place, so there is no separate "final" invoice to require —
    // just confirm an invoice exists at all.
    const hasInvoice = invoices.some((invoice) => invoice.status !== "void")
    if (!hasInvoice) {
      failures.push({
        gateId: "final_invoice",
        message: "An invoice is required before marking the booking paid in full.",
        fixHint: "Generate the booking's invoice before moving to Paid in Full.",
        // `block`, not `confirm`. Nothing about this is a judgement call the
        // salesperson signs off on, and as a confirm gate it rendered as an
        // alert with nothing to tick — so ticking the paid-in-full box below
        // moved the booking to Paid in Full with no invoice attached at all.
        severity: "block",
      })
    } else if (
      !hasSubjectCorrespondence(correspondences, ["final invoice"]) &&
      !hasSentCorrespondence(correspondences, "payment_received", ["payment received"]) &&
      // A full-payment invoice's confirmation email doesn't say "final invoice" —
      // any sent invoice correspondence covers it since it's the one email sent.
      !(
        invoices.some((invoice) => invoice.kind === "full" && invoice.status !== "void") &&
        hasSentCorrespondence(correspondences, "invoice", ["invoice"])
      )
    ) {
      failures.push({
        gateId: "final_invoice_correspondence",
        message: "The payment confirmation hasn't gone out yet.",
        fixHint: "Send the payment confirmation email to continue. This can be overridden with a recorded reason.",
        severity: "block",
      })
    }
  }

  if (crossedStages.includes("final_paid") && !manualConfirmations.finalPaymentReceived) {
    failures.push({
      gateId: "final_payment_confirmation",
      message: "Payment in full needs confirming.",
      fixHint: "No amount entry needed — the balance is already on record.",
      severity: "confirm",
      confirmLabel: "I confirm the full balance has been received.",
    })
  }

  if (crossedStages.includes("voucher_sent")) {
    // Checked before the PDF gate on purpose. A voucher cannot be generated at all while a leg is
    // missing its supplier reference (/api/voucher/generate 422s), so surfacing `voucher_document`
    // first sent the user into the voucher dialog to click a Generate button that could only fail.
    // This gate names the real blocker and points at the tab that fixes it.
    const missingReferences = (input.legReferences ?? [])
      .filter((leg) => !isPresent(leg.supplierReference))
      .map((leg) => leg.label)

    if (missingReferences.length > 0) {
      failures.push({
        gateId: "leg_references",
        message: `Supplier reference numbers are missing for: ${missingReferences.join(", ")}.`,
        fixHint: "Add a reference number for every leg on the Voucher Details tab.",
        severity: "block",
      })
    }

    if (!hasDocument(documents, "voucher_pdf")) {
      failures.push({
        gateId: "voucher_document",
        message: "A voucher PDF is required before moving to Voucher Sent.",
        fixHint: "Generate the voucher PDF, preview it, and send it to the customer.",
        // `block`, not `confirm`. `autoFixable` already lets the booking page
        // skip the modal entirely and open the voucher dialog when generating
        // can succeed; whenever it can't (a leg still missing its supplier
        // reference), a missing PDF is a hard stop, not something to tick past.
        severity: "block",
        autoFixable: "create_voucher_pdf",
      })
    }

    if (!hasCorrespondence(correspondences, "voucher", ["voucher", "travel document"])) {
      failures.push({
        gateId: "voucher_correspondence",
        message: "The voucher email hasn't been created yet.",
        fixHint: "Create or send the voucher email from the booking's Emails tab to continue.",
        severity: "block",
      })
    }
  }

  return failures
}

export function getCrossedForwardStages(fromStage: PipelineStage, targetStage: PipelineStage): PipelineStage[] {
  // Same reopen rule as validateTransition: coming off `lost` re-enters the
  // ladder below `enquiry`, so the side effects for every stage up to the
  // target are applied, not skipped.
  const reopening = isReopenFromCancelled(fromStage)
  const fromIndex = reopening ? -1 : stageIndex(fromStage)
  const toIndex = stageIndex(targetStage)

  if (toIndex === -1 || (!reopening && (fromIndex === -1 || toIndex <= fromIndex))) {
    return []
  }

  return FORWARD_STAGES.slice(fromIndex + 1, toIndex + 1)
}
