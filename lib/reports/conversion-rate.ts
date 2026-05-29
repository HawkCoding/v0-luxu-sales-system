import { getCanonicalPipelineStage } from "@/lib/types"
import { applyBookingFilter, type BookingInputRow, type ReportFilter } from "./types"

export interface ConversionRateResult {
  total: number
  won: number
  lost: number
  cancelled: number
  rate: number
}

export function conversionRate(
  bookings: BookingInputRow[],
  filter: ReportFilter,
): ConversionRateResult {
  const filtered = applyBookingFilter(bookings, filter)
  const won = filtered.filter(
    (b) => getCanonicalPipelineStage(b.stage as Parameters<typeof getCanonicalPipelineStage>[0]) === "closed",
  ).length
  const lost = filtered.filter((b) => b.outcome === "Lost").length
  const cancelled = filtered.filter((b) => b.outcome === "Cancelled").length
  const total = filtered.length
  return {
    total,
    won,
    lost,
    cancelled,
    rate: total > 0 ? won / total : 0,
  }
}
