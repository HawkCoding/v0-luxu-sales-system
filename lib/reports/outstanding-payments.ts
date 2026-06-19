import { getCanonicalPipelineStage } from "@/lib/types"
import { applyBookingFilter, type BookingInputRow, type ReportFilter } from "./types"

export interface OutstandingPaymentRow {
  bookingId: string
  bookingNumber: string
  consultant: string | null
  departureDate: string | null
  balance: number
  stage: string
}

export function outstandingPayments(
  bookings: BookingInputRow[],
  filter: ReportFilter,
): OutstandingPaymentRow[] {
  const filtered = applyBookingFilter(bookings, filter)

  return filtered
    .filter((b) => {
      const balance = b.invoice_balance ?? 0
      const canonicalStage = getCanonicalPipelineStage(
        b.stage as Parameters<typeof getCanonicalPipelineStage>[0],
      )
      return balance > 0 && !["closed", "lost"].includes(canonicalStage)
    })
    .map((b) => ({
      bookingId: b.id,
      bookingNumber: b.booking_number,
      consultant: b.owner_name ?? null,
      departureDate: b.departure_date,
      balance: b.invoice_balance ?? 0,
      stage: b.stage,
    }))
    .sort((a, b) => b.balance - a.balance)
}
