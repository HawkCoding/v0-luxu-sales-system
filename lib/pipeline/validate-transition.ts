import type { PipelineStage } from "@/lib/types"

export type GateSeverity = "block" | "confirm"

export type GateAutoFix = "create_invoice_25pct" | "create_invoice_correspondence"

export interface GateFailure {
  gateId: string
  message: string
  fixHint: string
  severity: GateSeverity
  autoFixable?: GateAutoFix
}

export interface TransitionBooking {
  id: string
  stage: PipelineStage
  source?: string | null
  email_import_needs_review?: boolean | null
  email_import_review_resolved_at?: string | null
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
}

export interface TransitionCorrespondence {
  kind?: string | null
  subject?: string | null
  status?: string | null
}

export interface ManualConfirmations {
  createDepositInvoice?: boolean
  createInvoiceCorrespondence?: boolean
  depositReceived?: boolean
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
  correspondences?: TransitionCorrespondence[]
  manualConfirmations?: ManualConfirmations
  lostContext?: LostContext
}

const CANONICAL_STAGE: Partial<Record<PipelineStage, PipelineStage>> = {
  quoted: "quote_sent",
  form_done: "accepted",
  payment_schedule: "deposit_requested",
  trip_active: "voucher_sent",
}

const FORWARD_STAGES: PipelineStage[] = [
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

  const fromIndex = stageIndex(input.booking.stage)
  const toIndex = stageIndex(targetStage)

  if (fromIndex === -1 || toIndex === -1 || toIndex <= fromIndex) {
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
  const documents = input.documents ?? []
  const correspondences = input.correspondences ?? []
  const manualConfirmations = input.manualConfirmations ?? {}
  const crossedStages = FORWARD_STAGES.slice(fromIndex + 1, toIndex + 1)

  if (
    crossedStages.includes("accepted") &&
    !quotes.some((quote) => quote.status === "sent" || quote.status === "accepted")
  ) {
    failures.push({
      gateId: "quote_sent_or_accepted",
      message: "At least one sent or accepted quote is required before quote acceptance.",
      fixHint: "Send a quote from the booking before moving it to Quote Accepted.",
      severity: "block",
    })
  }

  if (crossedStages.includes("deposit_requested")) {
    const hasInvoiceDocument = hasDocument(documents, "invoice_pdf")
    if (!hasInvoiceDocument && !manualConfirmations.createDepositInvoice) {
      failures.push({
        gateId: "invoice_document",
        message: "A deposit invoice document is required before requesting the deposit.",
        fixHint: "Confirm that the system should create a 25% deposit invoice document and scheduled email.",
        severity: "confirm",
        autoFixable: "create_invoice_25pct",
      })
    } else if (
      hasInvoiceDocument &&
      !hasCorrespondence(correspondences, "invoice", ["invoice", "deposit request"]) &&
      !manualConfirmations.createInvoiceCorrespondence
    ) {
      failures.push({
        gateId: "invoice_correspondence",
        message: "Invoice correspondence must exist before the deposit invoice stage.",
        fixHint: "Confirm that the system should schedule the invoice/deposit request email.",
        severity: "confirm",
        autoFixable: "create_invoice_correspondence",
      })
    }
  }

  if (crossedStages.includes("deposit_paid") && !manualConfirmations.depositReceived) {
    failures.push({
      gateId: "deposit_received_confirmation",
      message: "Confirm the deposit has been received before marking Deposit Paid.",
      fixHint: "Tick the deposit received confirmation in the transition modal.",
      severity: "confirm",
    })
  }

  if (crossedStages.includes("final_paid") && !manualConfirmations.finalPaymentReceived) {
    failures.push({
      gateId: "final_payment_confirmation",
      message: "Confirm the booking is paid in full before moving to Paid in Full.",
      fixHint: "Tick the final payment confirmation in the transition modal.",
      severity: "confirm",
    })
  }

  if (crossedStages.includes("voucher_sent")) {
    if (!hasDocument(documents, "voucher_pdf")) {
      failures.push({
        gateId: "voucher_document",
        message: "A voucher PDF is required before moving to Voucher Sent.",
        fixHint: "Generate or upload the voucher document from the booking documents tab.",
        severity: "block",
      })
    }

    if (!hasCorrespondence(correspondences, "voucher", ["voucher", "travel document"])) {
      failures.push({
        gateId: "voucher_correspondence",
        message: "Voucher correspondence must exist before moving to Voucher Sent.",
        fixHint: "Create or send the voucher email from the booking correspondence tab.",
        severity: "block",
      })
    }
  }

  return failures
}

export function getCrossedForwardStages(fromStage: PipelineStage, targetStage: PipelineStage): PipelineStage[] {
  const fromIndex = stageIndex(fromStage)
  const toIndex = stageIndex(targetStage)

  if (fromIndex === -1 || toIndex === -1 || toIndex <= fromIndex) {
    return []
  }

  return FORWARD_STAGES.slice(fromIndex + 1, toIndex + 1)
}
