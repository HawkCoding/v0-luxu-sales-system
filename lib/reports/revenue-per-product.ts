import {
  applyBookingFilter,
  getProductFromBookingNumber,
  groupPaymentsByBookingId,
  type BookingInputRow,
  type PaymentInputRow,
  type ReportFilter,
} from "./types"

export interface RevenuePerProductRow {
  product: string
  revenue: number
  bookingCount: number
}

export function revenuePerProduct(
  bookings: BookingInputRow[],
  payments: PaymentInputRow[],
  filter: ReportFilter,
): RevenuePerProductRow[] {
  const filtered = applyBookingFilter(bookings, filter)
  const revenueByBooking = groupPaymentsByBookingId(payments)

  const map = new Map<string, RevenuePerProductRow>()
  for (const b of filtered) {
    const product = getProductFromBookingNumber(b.booking_number)
    const existing = map.get(product) ?? { product, revenue: 0, bookingCount: 0 }
    existing.bookingCount++
    existing.revenue += revenueByBooking.get(b.id) ?? 0
    map.set(product, existing)
  }

  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue)
}
