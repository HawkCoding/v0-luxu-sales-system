export const PAYMENT_KIND_VALUES = ["capture", "refund"] as const
export type PaymentKind = (typeof PAYMENT_KIND_VALUES)[number]

/** Returns a validation message when `amount`'s sign doesn't match `kind`, else null. */
export function paymentKindSignIssue(kind: PaymentKind, amount: number): string | null {
  if (kind === "capture" && amount <= 0) return "capture payments must have a positive amount"
  if (kind === "refund" && amount >= 0) return "refund payments must have a negative amount"
  return null
}
