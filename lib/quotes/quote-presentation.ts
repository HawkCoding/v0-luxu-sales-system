// Shared presentation helpers for the quote PDF and the {{quoteSummaryTable}}
// email block, so pax/journey/total wording never diverges between the two.

import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { voucherServiceTypeLabel } from "@/lib/generate-voucher"
import { LONG_MONTH_NAMES, formatDayOfMonth, formatDisplayDateLong } from "@/lib/date-format"
import type { BulletLine } from "@/lib/inclusions/bullet-lines"
import { parseBulletLines, stripBulletMarker } from "@/lib/inclusions/bullet-lines"
import type { QuoteLineItem } from "@/lib/types"

export type { BulletLine } from "@/lib/inclusions/bullet-lines"

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
  /**
   * Supplier inclusions rendered beneath the line: `item` bullets get a dash, `heading` bullets
   * print bold and undashed so a long list can be broken into sections. See
   * @/lib/inclusions/bullet-lines.
   */
  bullets: BulletLine[]
}

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/

/**
 * Deliberately stricter than `parseDateInput` in @/lib/date-format: only a
 * leading YYYY-MM-DD is accepted (a trailing time portion is ignored, anything
 * else is null), and it is read as local time so a date never shifts a day.
 * Parse here, then hand the Date to the shared formatters.
 */
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

/**
 * Suffix asserting a client-facing amount already includes VAT. Single source
 * so the quote PDF, the quote email block, the invoice PDF and the template
 * editor's token preview can never drift apart.
 */
export const VAT_INCLUSIVE_SUFFIX = "(incl.VAT)"

/**
 * The reassurance line shown under the flight itinerary bullet: "flights won't cost the client
 * more than this." One combined line for the whole quote, at the highest adult flight fare —
 * unambiguous when a booking has more than one flight leg or cabin, and never understates.
 * Suppressed (null) when no flight has been priced yet, so a R0 placeholder is never shown as a cap.
 */
export function deriveFlightCapPerPerson(
  lineItems: readonly Pick<QuoteLineItem, "unitPrice" | "pricingSnapshot">[],
): number | null {
  const adultFlightFares = lineItems
    .filter(
      (item) =>
        item.pricingSnapshot?.supplierKind === "airline" &&
        item.pricingSnapshot?.passengerKind === "adult" &&
        item.unitPrice > 0,
    )
    .map((item) => item.unitPrice)

  return adultFlightFares.length > 0 ? Math.max(...adultFlightFares) : null
}

/** "Flights are capped at R2 000 pp — incl. baggage & fees" */
export function formatFlightCapLine(amountFormatter: (amount: number) => string, capPerPerson: number): string {
  return `Flights are capped at ${amountFormatter(capPerPerson)} pp — incl. baggage & fees`
}

/**
 * Journey window derived from the legs actually priced into the quote, not the
 * booking's enquiry-time scalar dates (departure_date/trip_*), which drift out
 * of sync once package legs change. start = earliest leg date, end = latest
 * (covers hotel check-out). Returns null when no block carries a date.
 */
export function deriveJourneyFromBlocks(blocks: VoucherServiceBlock[]): QuoteJourneyDates | null {
  const dates: string[] = []
  for (const block of blocks) {
    const d = block.serviceData
    for (const raw of [d.departureDate, d.arrivalDate]) {
      const parsed = parseIsoDate(raw)
      if (parsed) dates.push(toIsoDateString(parsed))
    }
  }
  if (dates.length === 0) return null
  dates.sort()
  return { start: dates[0], end: dates[dates.length - 1] }
}

/**
 * "18 – 22 July 2026" (same month), "28 July – 02 August 2026" (cross-month),
 * "18 December 2026 – 03 January 2027" (cross-year), "18 July 2026" (start
 * only), null when no start date. Days are zero-padded throughout.
 */
export function formatJourneyRange(start: string | null, end: string | null): string | null {
  const startDate = parseIsoDate(start)
  if (!startDate) return null

  const endDate = parseIsoDate(end)
  const startLong = formatDisplayDateLong(startDate)
  if (!endDate || endDate.getTime() === startDate.getTime()) return startLong

  const endLong = formatDisplayDateLong(endDate)
  if (startDate.getFullYear() !== endDate.getFullYear()) return `${startLong} – ${endLong}`
  if (startDate.getMonth() !== endDate.getMonth()) {
    return `${formatDayOfMonth(startDate)} ${LONG_MONTH_NAMES[startDate.getMonth()]} – ${endLong}`
  }
  return `${formatDayOfMonth(startDate)} – ${endLong}`
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

/** "Pretoria → Cape Town" → "Pretoria to Cape Town" — the flowing prose style used in the
 * itinerary line. The base-14 Helvetica font the PDF renders with has no glyph for the arrow, so
 * it must never reach this sentence as-is. */
function toProseRoute(route: string): string {
  return route.replace(/\s*[→↔]\s*/g, " to ")
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
          `${onBoard} the ${supplier || "train"}`,
          d.suiteType ? `in a ${d.suiteType}` : null,
          "on an all-inclusive basis",
          d.route ? `— ${toProseRoute(d.route)}` : null,
        ],
        [start ? `Departs at ${start}` : null],
      )
    }
    case "transfer": {
      // Transfer/car-rental supplier identity is never shown to the client — always generic.
      const leg = d.pickup && d.dropoff ? `from ${d.pickup} to ${d.dropoff}` : d.route ? `— ${d.route}` : null
      return joinSentence(
        ["Transfer", leg, d.vehicleType ? `(${d.vehicleType})` : null],
        [start ? `at ${start}` : null],
      )
    }
    case "tour": {
      const title = block.title?.trim() || supplier || "Excursion"
      // Leg labels are often already written as "Excursion in Kimberley" — don't say it twice.
      const namesLocation = location ? title.toLowerCase().includes(location.toLowerCase()) : true
      // The booked itinerary names the day; the tour type it belongs to is what was priced.
      const itinerary = d.itinerary?.trim() || null
      const namesItinerary = itinerary ? title.toLowerCase().includes(itinerary.toLowerCase()) : true
      return joinSentence(
        [
          title,
          namesLocation ? null : `in ${location}`,
          namesItinerary ? null : `— ${itinerary}`,
        ],
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
    const where = d.arrivalStation?.trim()
    return {
      dateISO: d.arrivalDate,
      text: end
        ? `Arrival${where ? ` at ${where} station` : ""} at ${end}`
        : `Arrival${where ? ` at ${where} station` : ""}`,
      bullets: [{ kind: "item", text: "Train arrival times cannot be guaranteed" }],
    }
  }
  return null
}

/**
 * The client-facing itinerary. One block can produce two lines — a hotel stay is a check-in line
 * and a separate check-out line on a later date — so lines are re-sorted by date afterwards.
 *
 * `flightCapBullet` (already formatted, e.g. "Flights are capped at R2 000 pp — incl. baggage &
 * fees" via {@link formatFlightCapLine}) is attached under the *first* flight block only, one
 * combined line for the whole quote rather than repeated per flight.
 */
export function buildQuoteItineraryLines(
  blocks: VoucherServiceBlock[],
  flightCapBullet?: string | null,
): QuoteItineraryLine[] {
  const lines: QuoteItineraryLine[] = []
  let flightCapAttached = false

  blocks.forEach((block) => {
    const d = block.serviceData
    const bullets = parseBulletLines(d.inclusions)
    // What the booked itinerary covers, straight off the supplier's itinerary — leads the
    // supplier's standing inclusions because it is specific to this day.
    if (block.serviceType === "tour" && d.itineraryDescription?.trim()) {
      bullets.unshift({ kind: "item", text: d.itineraryDescription.trim() })
    }
    if (d.notes?.trim()) bullets.push({ kind: "item", text: d.notes.trim() })
    if (flightCapBullet && !flightCapAttached && block.serviceType === "airline") {
      bullets.push({ kind: "item", text: flightCapBullet })
      flightCapAttached = true
    }

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

/**
 * Every supplier exclusion on the quote, de-duplicated, with the standing exclusion last.
 * Exclusions are pooled across suppliers, so a subheading typed here would be orphaned from
 * the lines it introduced: the `#` marker is stripped and the line kept as a plain exclusion.
 */
export function collectQuoteExclusions(
  blocks: VoucherServiceBlock[],
  defaultExclusion?: string | null,
): string[] {
  const seen = new Set<string>()
  const exclusions: string[] = []

  for (const block of blocks) {
    for (const raw of block.serviceData.exclusions ?? []) {
      const value = stripBulletMarker(raw)
      if (!value || seen.has(value.toLowerCase())) continue
      seen.add(value.toLowerCase())
      exclusions.push(value)
    }
  }

  const fallback = defaultExclusion?.trim()
  if (fallback && !seen.has(fallback.toLowerCase())) exclusions.push(fallback)

  return exclusions
}
