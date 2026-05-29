import { applyBookingFilter, type BookingInputRow, type ReportFilter } from "./types"

export interface EnquiriesBySourceRow {
  source: string
  count: number
}

export function enquiriesBySource(
  bookings: BookingInputRow[],
  filter: ReportFilter,
): EnquiriesBySourceRow[] {
  const filtered = applyBookingFilter(bookings, filter)

  const map = new Map<string, number>()
  for (const b of filtered) {
    map.set(b.source, (map.get(b.source) ?? 0) + 1)
  }

  return Array.from(map.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
}
