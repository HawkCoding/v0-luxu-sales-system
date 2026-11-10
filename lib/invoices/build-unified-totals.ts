import type { InvoiceBalance } from "@/lib/invoices/calculate-balance"
import { computeFinalDueDate } from "@/lib/invoices/invoice-status"
import { MIN_DEPOSIT_PAID_AMOUNT } from "@/lib/invoices/sync-booking-payment-state"
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
      discount: balance.discount,
      discountVisible: balance.discountVisible,
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

  let depositAmount = input.depositAmount
  let depositPercentage = input.depositPercentage
  let finalAmount = Math.max(0, round2(balance.quoteTotal - (depositAmount ?? 0)))

  // Once the deposit is actually paid, show what was recorded instead of the calculated split:
  // the earliest payment is the deposit, the rest is the final payment (or, until that arrives,
  // whatever is still outstanding). The calculated "25%" no longer applies, so the percentage goes.
  const [firstPayment, ...laterPayments] = balance.payments ?? []
  if (
    depositAmount !== null &&
    firstPayment &&
    firstPayment.amount >= Math.min(depositAmount, MIN_DEPOSIT_PAID_AMOUNT)
  ) {
    depositAmount = round2(firstPayment.amount)
    depositPercentage = null
    finalAmount =
      laterPayments.length > 0
        ? round2(laterPayments.reduce((sum, payment) => sum + payment.amount, 0))
        : Math.max(0, round2(balance.quoteTotal - depositAmount))
  }

  return {
    subtotalInclVat: balance.quoteSubtotal,
    agentCommission: balance.agentCommission,
    discount: balance.discount,
    discountVisible: balance.discountVisible,
    totalInclVat: balance.quoteTotal,
    depositPercentage,
    depositAmount,
    finalAmount,
    finalDueDate: computeFinalDueDate(input.departureDate),
    amountReceived: balance.totalPaid,
    amountReceivedAt: balance.lastPaymentAt,
    outstanding: balance.balance,
  }
}
