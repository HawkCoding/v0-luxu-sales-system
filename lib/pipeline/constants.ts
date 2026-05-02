export const DEFAULT_DEPOSIT_PERCENT = 0.25

export function calculateDepositAmount(quoteTotal: number): number {
  return Math.round(quoteTotal * DEFAULT_DEPOSIT_PERCENT * 100) / 100
}
