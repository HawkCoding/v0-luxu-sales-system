import { getCanonicalPipelineStage } from "@/lib/types"
import {
  applyBookingFilter,
  groupPaymentsByBookingId,
  type BookingInputRow,
  type PaymentInputRow,
  type ReportFilter,
} from "./types"

export interface SalesPerSalespersonRow {
  consultant: string
  bookingCount: number
  revenue: number
  wonCount: number
}

export function salesPerSalesperson(
  bookings: BookingInputRow[],
  payments: PaymentInputRow[],
  filter: ReportFilter,
): SalesPerSalespersonRow[] {
  const filtered = applyBookingFilter(bookings, filter)
  const revenueByBooking = groupPaymentsByBookingId(payments)

  const map = new Map<string, SalesPerSalespersonRow>()
  for (const b of filtered) {
    const key = b.owner_name ?? "Unassigned"
    const existing = map.get(key) ?? {
      consultant: key,
      bookingCount: 0,
      revenue: 0,
      wonCount: 0,
    }
    existing.bookingCount++
    existing.revenue += revenueByBooking.get(b.id) ?? 0
    if (getCanonicalPipelineStage(b.stage as Parameters<typeof getCanonicalPipelineStage>[0]) === "closed") {
      existing.wonCount++
    }
    map.set(key, existing)
  }

  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue)
}
