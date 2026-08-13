import { calculateDepositAmount } from "@/lib/pipeline/constants"

/**
 * The deposit figure a cancellation fee is calculated against.
 *
 * A booking invoiced with a separate deposit invoice uses that invoice amount.
 * A full-payment booking never had one, so it falls back to a notional deposit
 * percentage of the full invoice. Shared by the cancel route and the booking
 * detail route so the suggested refund shown in the UI matches what the server
 * would actually calculate.
 */
export function resolveDepositAmount(
  depositInvoiceAmount: number | null,
  fullInvoiceAmount: number | null,
  defaultDepositPercentage: number,
): number {
  if (depositInvoiceAmount !== null) return depositInvoiceAmount
  if (fullInvoiceAmount !== null) {
    return calculateDepositAmount(fullInvoiceAmount, defaultDepositPercentage)
  }
  return 0
}
