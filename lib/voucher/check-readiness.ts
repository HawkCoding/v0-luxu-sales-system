export type ReadinessFailureCode =
  | "stage_not_eligible"
  | "balance_not_zero"
  | "departure_date_missing"
  | "customer_email_missing"
  | "leg_references_missing"

export interface ReadinessFailure {
  code: ReadinessFailureCode
  message: string
  fixHint: string
}

export interface VoucherReadinessResult {
  ready: boolean
  failures: ReadinessFailure[]
}

export interface VoucherReadinessInput {
  stage: string | null
  invoiceBalance: number | null
  departureDate: string | null
  customerEmail: string | null
  missingLegReferenceLabels: string[]
}

const PAID_IN_FULL_STAGES = new Set(["final_paid", "voucher_sent", "closed"])

export function checkVoucherReadiness(input: VoucherReadinessInput): VoucherReadinessResult {
  const failures: ReadinessFailure[] = []

  if (!PAID_IN_FULL_STAGES.has(input.stage ?? "")) {
    failures.push({
      code: "stage_not_eligible",
      message: "The booking must be in Paid in Full, Voucher Sent, or Closed stage.",
      fixHint: "Move the booking to Paid in Full before generating a voucher.",
    })
  }

  if (Number(input.invoiceBalance ?? NaN) !== 0) {
    failures.push({
      code: "balance_not_zero",
      message: "The invoice balance must be zero before generating a voucher.",
      fixHint: "Record all outstanding payments to clear the invoice balance.",
    })
  }

  if (!input.departureDate) {
    failures.push({
      code: "departure_date_missing",
      message: "A departure date is required before generating a voucher.",
      fixHint: "Set the departure date on the booking.",
    })
  }

  if (!input.customerEmail?.trim()) {
    failures.push({
      code: "customer_email_missing",
      message: "Customer email is required before generating a voucher.",
      fixHint: "Add an email address to the customer record.",
    })
  }

  if (input.missingLegReferenceLabels.length > 0) {
    failures.push({
      code: "leg_references_missing",
      message: `Supplier reference numbers are missing for: ${input.missingLegReferenceLabels.join(", ")}.`,
      fixHint: "Add a reference number for every leg on the Voucher References tab.",
    })
  }

  return { ready: failures.length === 0, failures }
}
