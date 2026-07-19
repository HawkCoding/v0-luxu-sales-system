import type { InvoiceBalance } from "@/lib/invoices/calculate-balance"
import { computeFinalDueDate } from "@/lib/invoices/invoice-status"
import type { InvoiceTotals } from "@/lib/invoices/pdf/invoice-document"

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * The one money ladder every issue of the booking's invoice shows: the client
 * receives a single invoice whose deposit, final-due and received figures are
 * refreshed on each send. Final payment falls due 60 days before departure.
 */
export function buildUnifiedTotals(input: {
  balance: InvoiceBalance
  departureDate: string | null | undefined
  depositPercentage: number | null
  depositAmount: number | null
}): InvoiceTotals {
  const { balance } = input
  const depositAmount = input.depositAmount
  return {
    subtotalInclVat: balance.quoteTotal,
    depositPercentage: input.depositPercentage,
    depositAmount,
    finalAmount: Math.max(0, round2(balance.quoteTotal - (depositAmount ?? 0))),
    finalDueDate: computeFinalDueDate(input.departureDate),
    amountReceived: balance.totalPaid,
    amountReceivedAt: balance.lastPaymentAt,
    outstanding: balance.balance,
  }
}
