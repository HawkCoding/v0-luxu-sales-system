import type { QuoteLineItem } from "@/lib/types"
import { addDays } from "@/lib/packages/hotel-dates"
import { formatDayOfMonth, formatDisplayDateShort, SHORT_MONTH_NAMES } from "@/lib/date-format"

/**
 * The calendar dates a quote line covers, for the internal quote tables (Build Booking's review
 * step and the job's Quotes tab). Read-only and staff-facing: the client email, preview and PDFs
 * keep their own date wording.
 *
 * The start is the snapshot's travelDate (the date the line priced against). The end is
 * serviceEndDate, stamped at build time since 2026-10. Lines built before that have none, so a
 * hotel works its check-out out from the stay length and everything else shows its start alone.
 */

export interface LineDateRange {
  /** YYYY-MM-DD */
  start: string
  /** YYYY-MM-DD, >= start */
  end: string
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
// Hand-typed money lines with no service behind them.
const NON_SERVICE_DESCRIPTION = /^\s*(rounding|adjustment)\b/i

function isoDate(value: string | null | undefined): string | null {
  const date = value?.slice(0, 10)
  if (!date || !ISO_DATE_PATTERN.test(date)) return null
  return Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ? null : date
}

function positiveWhole(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : null
}

/** Nights a legacy hotel line covers: the stay, else the charged nights, else qty — the last only
 *  where qty really is nights (per-room pricing or a typed room price). */
function legacyHotelNights(line: QuoteLineItem): number | null {
  const snapshot = line.pricingSnapshot
  if (!snapshot) return null
  const qtyIsNights = snapshot.accommodationPricingBasis === "per_room" || snapshot.manualRoomPrice != null
  return (
    positiveWhole(snapshot.stayNights) ??
    positiveWhole(snapshot.chargedNights) ??
    (qtyIsNights ? positiveWhole(line.qty) : null)
  )
}

export function lineDateRange(line: QuoteLineItem): LineDateRange | null {
  const snapshot = line.pricingSnapshot
  if (!snapshot || snapshot.commission) return null
  if (NON_SERVICE_DESCRIPTION.test(line.description)) return null

  const start = isoDate(snapshot.travelDate)
  if (!start) return null

  const stampedEnd = isoDate(snapshot.serviceEndDate)
  if (stampedEnd) return { start, end: stampedEnd >= start ? stampedEnd : start }

  if (snapshot.supplierKind === "hotel_property") {
    const nights = legacyHotelNights(line)
    if (nights) return { start, end: addDays(start, nights) }
  }

  return { start, end: start }
}

/**
 * "09 Jul 2027", "09–12 Jul 2027", "28 Jul – 02 Aug 2027", "28 Dec 2027 – 02 Jan 2028" — the
 * month/year collapsing of formatJourneyRange (lib/quotes/quote-presentation.ts) in short months.
 * Null when the line has no date.
 */
export function describeLineDate(line: QuoteLineItem): string | null {
  const range = lineDateRange(line)
  if (!range) return null

  const startShort = formatDisplayDateShort(range.start)
  if (range.end === range.start) return startShort

  const endShort = formatDisplayDateShort(range.end)
  if (range.start.slice(0, 4) !== range.end.slice(0, 4)) return `${startShort} – ${endShort}`
  if (range.start.slice(5, 7) !== range.end.slice(5, 7)) {
    const startMonth = SHORT_MONTH_NAMES[Number(range.start.slice(5, 7)) - 1]
    return `${formatDayOfMonth(range.start)} ${startMonth} – ${endShort}`
  }
  return `${formatDayOfMonth(range.start)}–${endShort}`
}
