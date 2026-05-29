export interface RefundCalculation {
  suggestedRefund: number
  cancellationFee: number
}

export function calculateRefund(
  totalPaid: number,
  depositAmount: number,
  depositRefundable: boolean,
): RefundCalculation {
  const cancellationFee = depositRefundable ? 0 : depositAmount
  const suggestedRefund = Math.max(0, Math.round((totalPaid - cancellationFee) * 100) / 100)
  return { suggestedRefund, cancellationFee }
}
