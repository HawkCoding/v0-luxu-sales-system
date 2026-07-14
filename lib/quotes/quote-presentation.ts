// Shared presentation helpers for the quote PDF and the {{quoteSummaryTable}}
// email block, so pax/journey/total wording never diverges between the two.

import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { voucherServiceTypeLabel } from "@/lib/generate-voucher"

export interface QuotePax {
  adults: number
  children: number
}

export interface QuoteJourneyDates {
  start: string | null
  end: string | null
}

export interface QuoteItineraryLine {
  dateISO: string | null
  title: string
  details: string[]
}

const LONG_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const match = DATE_ONLY_PATTERN.exec(value)
  if (!match) return null
  const [, year, month, day] = match
  const parsed = new Date(Number(year), Number(month) - 1, Number(day))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toIsoDateString(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** "2 Adults" | "1 Adult + 2 Children" | "" when both counts are 0. */
export function formatPaxLabel({ adults, children }: QuotePax): string {
  const parts: string[] = []
  if (adults > 0) parts.push(`${adults} ${adults === 1 ? "Adult" : "Adults"}`)
  if (children > 0) parts.push(`${children} ${children === 1 ? "Child" : "Children"}`)
  return parts.join(" + ")
}

/**
 * Flat per-person rate is only honest for adults-only bookings (child pricing
 * differs); otherwise return null so callers show the total alone.
 */
export function derivePerPersonRate(total: number, pax: QuotePax): number | null {
  if (pax.children > 0 || pax.adults <= 0) return null
  return Math.round((total / pax.adults) * 100) / 100
}

/** "TOTAL for 2 Adults" | "TOTAL" when pax is unknown. */
export function formatTotalLabel(pax: QuotePax): string {
  const label = formatPaxLabel(pax)
  return label ? `TOTAL for ${label}` : "TOTAL"
}

/** Journey window from booking fields, with duration_nights as end fallback. */
export function resolveJourneyDates(booking: {
  trip_start_date: string | null
  trip_end_date: string | null
  departure_date: string | null
  duration_nights: number | null
}): QuoteJourneyDates {
  const start = booking.trip_start_date ?? booking.departure_date
  let end = booking.trip_end_date
  if (!end && start && booking.duration_nights && booking.duration_nights > 0) {
    const startDate = parseIsoDate(start)
    if (startDate) {
      startDate.setDate(startDate.getDate() + booking.duration_nights)
      end = toIsoDateString(startDate)
    }
  }
  return { start: start ?? null, end: end ?? null }
}

/**
 * "18 – 22 July 2026" (same month), "28 July – 2 August 2026" (cross-month),
 * "18 December 2026 – 3 January 2027" (cross-year), "18 July 2026" (start
 * only), null when no start date.
 */
export function formatJourneyRange(start: string | null, end: string | null): string | null {
  const startDate = parseIsoDate(start)
  if (!startDate) return null

  const endDate = parseIsoDate(end)
  const startLong = `${startDate.getDate()} ${LONG_MONTH_NAMES[startDate.getMonth()]} ${startDate.getFullYear()}`
  if (!endDate || endDate.getTime() === startDate.getTime()) return startLong

  const endLong = `${endDate.getDate()} ${LONG_MONTH_NAMES[endDate.getMonth()]} ${endDate.getFullYear()}`
  if (startDate.getFullYear() !== endDate.getFullYear()) return `${startLong} – ${endLong}`
  if (startDate.getMonth() !== endDate.getMonth()) {
    return `${startDate.getDate()} ${LONG_MONTH_NAMES[startDate.getMonth()]} – ${endLong}`
  }
  return `${startDate.getDate()} – ${endLong}`
}

function pushDetail(details: string[], value: string | null | undefined): void {
  const trimmed = value?.trim()
  if (trimmed) details.push(trimmed)
}

/** One itinerary display line per service block, shared by PDF and email. */
export function summarizeServiceBlock(block: VoucherServiceBlock): QuoteItineraryLine {
  const d = block.serviceData
  const details: string[] = []

  pushDetail(details, block.contactDetails.name)
  pushDetail(details, d.route)
  pushDetail(details, d.suiteType)
  pushDetail(details, d.roomType)
  pushDetail(details, d.vehicleType)
  pushDetail(details, d.cabin)
  if (d.pickup && d.dropoff) details.push(`${d.pickup} to ${d.dropoff}`)
  if (d.nights && d.nights > 0) details.push(`${d.nights} ${d.nights === 1 ? "night" : "nights"}`)
  if (d.durationDays && d.durationDays > 0) {
    details.push(`${d.durationDays} ${d.durationDays === 1 ? "day" : "days"}`)
  }
  pushDetail(details, d.mealPlan)
  pushDetail(details, d.notes)

  return {
    dateISO: d.departureDate ?? null,
    title: block.title || voucherServiceTypeLabel(block.serviceType),
    details,
  }
}
