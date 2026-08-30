import type { InvoiceBalance } from "@/lib/invoices/calculate-balance"
import { computeFinalDueDate } from "@/lib/invoices/invoice-status"
import type { InvoiceTotals } from "@/lib/invoices/pdf/invoice-document"

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * The one money ladder every issue of the booking's invoice shows: the client
 * receives a single invoice whose deposit, final-due and received figures are
 * refreshed on each send. Final payment falls due 2 calendar months before
 * departure, same day-of-month.
 *
 * `mode: "full"` is for bookings paying the whole amount in one go (made
 * inside 2 months of departure, or opted into by the salesperson) — the
 * deposit row is suppressed and the full total is shown on one due line.
 */
export function buildUnifiedTotals(input: {
  balance: InvoiceBalance
  departureDate: string | null | undefined
  depositPercentage: number | null
  depositAmount: number | null
  mode?: "deposit" | "full"
  /** Full-payment mode only: overrides the derived 2-months-before due date. */
  fullDueDate?: string | null
}): InvoiceTotals {
  const { balance } = input
  if (input.mode === "full") {
    return {
      subtotalInclVat: balance.quoteSubtotal,
      agentCommission: balance.agentCommission,
      totalInclVat: balance.quoteTotal,
      depositPercentage: null,
      depositAmount: null,
      finalAmount: balance.quoteTotal,
      finalDueDate: input.fullDueDate ?? computeFinalDueDate(input.departureDate),
      amountReceived: balance.totalPaid,
      amountReceivedAt: balance.lastPaymentAt,
      outstanding: balance.balance,
      fullPayment: true,
    }
  }

  const depositAmount = input.depositAmount
  return {
    subtotalInclVat: balance.quoteSubtotal,
    agentCommission: balance.agentCommission,
    totalInclVat: balance.quoteTotal,
    depositPercentage: input.depositPercentage,
    depositAmount,
    finalAmount: Math.max(0, round2(balance.quoteTotal - (depositAmount ?? 0))),
    finalDueDate: computeFinalDueDate(input.departureDate),
    amountReceived: balance.totalPaid,
    amountReceivedAt: balance.lastPaymentAt,
    outstanding: balance.balance,
  }
}
