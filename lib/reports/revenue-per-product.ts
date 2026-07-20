import {
  applyBookingFilter,
  groupPaymentsByBookingId,
  UNASSIGNED_PRODUCT_LABEL,
  type BookingInputRow,
  type PaymentInputRow,
  type ReportFilter,
} from "./types"

export interface RevenuePerProductRow {
  /** Train operator supplier id; null for bookings with no train leg priced yet. */
  productId: string | null
  /** Supplier display name, or "Unassigned". */
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

  // Group by supplier id so two operators sharing a display name never merge;
  // label by name for display.
  const map = new Map<string, RevenuePerProductRow>()
  for (const b of filtered) {
    const productId = b.product_supplier_id ?? null
    const key = productId ?? ""
    const existing = map.get(key) ?? {
      productId,
      product: b.product_supplier_name ?? UNASSIGNED_PRODUCT_LABEL,
      revenue: 0,
      bookingCount: 0,
    }
    existing.bookingCount++
    existing.revenue += revenueByBooking.get(b.id) ?? 0
    map.set(key, existing)
  }

  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue)
}
