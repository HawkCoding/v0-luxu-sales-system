import { isAtOrPastStage } from "@/lib/pipeline/validate-transition"
import { getCanonicalPipelineStage, PIPELINE_STAGE_LABELS, type PipelineStage } from "@/lib/types"

export type PaymentStatus = "not_paid" | "part_paid" | "deposit_paid" | "paid_in_full" | "refund_or_credit"

/** Display order for facets and legends: least to most paid, then credits. */
export const PAYMENT_STATUSES: PaymentStatus[] = [
  "not_paid",
  "part_paid",
  "deposit_paid",
  "paid_in_full",
  "refund_or_credit",
]

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  not_paid: "Not paid",
  part_paid: "Part paid",
  deposit_paid: "Deposit paid",
  paid_in_full: "Paid in full",
  refund_or_credit: "Refund or credit",
}

export function isPaymentStatus(value: string | null | undefined): value is PaymentStatus {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(PAYMENT_STATUS_LABELS, value as string)
}

export interface PaymentStatusInput {
  stage: PipelineStage | string
  depositPaid?: boolean | null
  /** Net of refunds — refunds are stored as negative payments. */
  totalPaid: number
}

/**
 * A record's payment position for list badges and filters. The stage is the floor: a booking at
 * Paid in Full or later is fully paid even when old imports carry no payment rows, and anything at
 * Deposit Paid or later has at least its deposit. Below that, recorded money decides. Aliases
 * (`trip_active`, `payment_schedule`, ...) count as their canonical stage.
 */
export function derivePaymentStatus({ stage, depositPaid, totalPaid }: PaymentStatusInput): PaymentStatus {
  if (totalPaid < 0) return "refund_or_credit"

  const canonical = Object.prototype.hasOwnProperty.call(PIPELINE_STAGE_LABELS, stage)
    ? getCanonicalPipelineStage(stage as PipelineStage)
    : null
  if (canonical && isAtOrPastStage(canonical, "final_paid")) return "paid_in_full"
  if (depositPaid || (canonical && isAtOrPastStage(canonical, "deposit_paid"))) return "deposit_paid"
  if (totalPaid > 0) return "part_paid"
  return "not_paid"
}
