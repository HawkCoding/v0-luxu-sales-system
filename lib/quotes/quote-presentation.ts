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
  /** One prose sentence, e.g. "Two nights at Irene Country Lodge … | Check in from 14h00". */
  text: string
  /** Supplier inclusions rendered as sub-bullets beneath the line. */
  bullets: string[]
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

const NIGHT_WORDS = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
]

/** "Two nights" | "12 nights" | "One night" — spelled out where the example wording does. */
function formatNights(count: number): string {
  const noun = count === 1 ? "night" : "nights"
  const word = count < NIGHT_WORDS.length ? NIGHT_WORDS[count] : String(count)
  return `${word} ${noun}`
}

/** "14:00" → "14h00", the house style used throughout the client-facing itinerary. */
export function formatTimeOfDay(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  const [hours, minutes] = trimmed.split(":")
  if (!hours || !minutes) return null
  return `${hours}h${minutes.slice(0, 2)}`
}

function joinSentence(
  parts: Array<string | null | undefined>,
  suffixes: Array<string | null | undefined>,
): string {
  const main = parts.filter((part): part is string => Boolean(part?.trim())).join(" ")
  const tail = suffixes.filter((part): part is string => Boolean(part?.trim()))
  return tail.length > 0 ? `${main} | ${tail.join(" – ")}` : main
}

function describeBlock(block: VoucherServiceBlock): string {
  const d = block.serviceData
  const supplier = block.contactDetails.name?.trim() || null
  const location = block.contactDetails.location?.trim() || null
  const start = formatTimeOfDay(d.startTime)

  switch (block.serviceType) {
    case "hotel": {
      const stay = d.nights && d.nights > 0 ? formatNights(d.nights) : "Stay"
      const at = [supplier, location].filter(Boolean).join(", ")
      return joinSentence(
        [
          `${stay} at ${at || "the hotel"}`,
          d.roomType ? `in a ${d.roomType}` : null,
          d.mealPlan ? `incl. ${d.mealPlan}` : null,
        ],
        [start ? `Check in from ${start}` : null],
      )
    }
    case "train": {
      // durationDays counts the departure day, so a 3-day journey is 2 nights on board.
      const nights = d.durationDays && d.durationDays > 1 ? d.durationDays - 1 : null
      const onBoard = nights ? `${formatNights(nights)} on` : "On board"
      return joinSentence(
        [
          `${onBoard} ${supplier || "the train"}`,
          d.suiteType ? `in a ${d.suiteType}` : null,
          d.route ? `— ${d.route}` : null,
        ],
        [start ? `Departs at ${start}` : null],
      )
    }
    case "transfer": {
      const leg = d.pickup && d.dropoff ? `from ${d.pickup} to ${d.dropoff}` : d.route ? `— ${d.route}` : null
      return joinSentence(
        [supplier ? `${supplier} transfer` : "Transfer", leg, d.vehicleType ? `(${d.vehicleType})` : null],
        [start ? `at ${start}` : null],
      )
    }
    case "tour": {
      const title = block.title?.trim() || supplier || "Excursion"
      // Leg labels are often already written as "Excursion in Kimberley" — don't say it twice.
      const namesLocation = location ? title.toLowerCase().includes(location.toLowerCase()) : true
      return joinSentence(
        [title, namesLocation ? null : `in ${location}`],
        [start ? `at ${start}` : null],
      )
    }
    case "airline": {
      return joinSentence(
        [
          supplier ? `Flight with ${supplier}` : "Flight",
          d.flightNumber,
          d.route ? `— ${d.route}` : null,
          d.cabin ? `in ${d.cabin}` : null,
        ],
        [start ? `Departs at ${start}` : null],
      )
    }
    default:
      return block.title?.trim() || supplier || voucherServiceTypeLabel(block.serviceType)
  }
}

/** The closing line of a stay or journey: check-out for hotels, arrival for everything else. */
function describeEndLine(block: VoucherServiceBlock): QuoteItineraryLine | null {
  const d = block.serviceData
  if (!d.arrivalDate) return null
  const end = formatTimeOfDay(d.endTime)

  if (block.serviceType === "hotel") {
    return {
      dateISO: d.arrivalDate,
      text: end ? `Check out at ${end}` : "Check out",
      bullets: [],
    }
  }
  if (block.serviceType === "train") {
    const where = block.contactDetails.location?.trim()
    return {
      dateISO: d.arrivalDate,
      text: end
        ? `Arrival${where ? ` in ${where}` : ""} at ${end}`
        : `Arrival${where ? ` in ${where}` : ""}`,
      bullets: ["Train arrival times cannot be guaranteed"],
    }
  }
  return null
}

/**
 * The client-facing itinerary. One block can produce two lines — a hotel stay is a check-in line
 * and a separate check-out line on a later date — so lines are re-sorted by date afterwards.
 */
export function buildQuoteItineraryLines(blocks: VoucherServiceBlock[]): QuoteItineraryLine[] {
  const lines: QuoteItineraryLine[] = []

  blocks.forEach((block) => {
    const d = block.serviceData
    const bullets = [...(d.inclusions ?? [])]
    if (d.notes?.trim()) bullets.push(d.notes.trim())

    lines.push({ dateISO: d.departureDate ?? null, text: describeBlock(block), bullets })

    const endLine = describeEndLine(block)
    if (endLine) lines.push(endLine)
  })

  // Undated lines keep their position at the end rather than sorting to the front.
  return lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => {
      const aDate = a.line.dateISO ?? "9999-12-31"
      const bDate = b.line.dateISO ?? "9999-12-31"
      if (aDate !== bDate) return aDate < bDate ? -1 : 1
      return a.index - b.index
    })
    .map((entry) => entry.line)
}

/** Every supplier exclusion on the quote, de-duplicated, with the standing exclusion last. */
export function collectQuoteExclusions(
  blocks: VoucherServiceBlock[],
  defaultExclusion?: string | null,
): string[] {
  const seen = new Set<string>()
  const exclusions: string[] = []

  for (const block of blocks) {
    for (const raw of block.serviceData.exclusions ?? []) {
      const value = raw.trim()
      if (!value || seen.has(value.toLowerCase())) continue
      seen.add(value.toLowerCase())
      exclusions.push(value)
    }
  }

  const fallback = defaultExclusion?.trim()
  if (fallback && !seen.has(fallback.toLowerCase())) exclusions.push(fallback)

  return exclusions
}
