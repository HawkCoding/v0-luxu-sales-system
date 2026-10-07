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
   * print bold and undashed, `warning` bullets print undashed in house red (e.g. "Train arrival
   * times cannot be guaranteed") so a long list can be broken into sections or flag a caveat. See
   * @/lib/inclusions/bullet-lines.
   */
  bullets: BulletLine[]
  /**
   * A hotel's own client-facing description (suppliers.description), rendered as an italic
   * paragraph in place of its facility bullets. Only ever set on a hotel's check-in line; null
   * everywhere else, including when the hotel has no description of its own (bullets fall back to
   * the facility list unchanged).
   */
  description?: string | null
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
 * The quote PDF's grand-total label: "Total for 4 Adults & 1 Child incl. VAT" | "Total for 2 Adults
 * incl. VAT" | "Total incl. VAT" when pax is unknown. Distinct from formatTotalLabel (the email's
 * upper-case "TOTAL for 2 Adults + 1 Child"), which the client never asked to change.
 */
export function formatQuoteGrandTotalLabel({ adults, children }: QuotePax): string {
  const parts: string[] = []
  if (adults > 0) parts.push(`${adults} ${adults === 1 ? "Adult" : "Adults"}`)
  if (children > 0) parts.push(`${children} ${children === 1 ? "Child" : "Children"}`)
  return parts.length > 0 ? `Total for ${parts.join(" & ")} incl. VAT` : "Total incl. VAT"
}

/**
 * Suffix asserting a client-facing amount already includes VAT. Single source
 * so the quote PDF, the quote email block, the invoice PDF and the template
 * editor's token preview can never drift apart.
 */
export const VAT_INCLUSIVE_SUFFIX = "(incl.VAT)"

/**
 * Client-facing label for the flat discount given to a booking agency (quotes.agent_commission).
 * Single source so the quote PDF, the quote email block and the invoice PDF read identically.
 */
export const AGENT_COMMISSION_LABEL = "Agent Commission"

/** House red for a client-visible deducted amount. Matches the invoice's bank-charges note. */
export const AGENT_COMMISSION_COLOR = "#c0392b"

/** "-R5,000.00" — a discount always reads as a subtraction, never as a bare positive figure. */
export function formatAgentCommission(amount: number, format: (value: number) => string): string {
  return `-${format(Math.abs(amount))}`
}

/**
 * Client-facing label for the Discount (quotes.discount_amount) — typed the same way as
 * Commission (percent/per_person/fixed) but, like Agent Commission, deducted at the total level
 * and shown to the client as a red line when quotes.discount_visible is true.
 */
export const DISCOUNT_LABEL = "Discount"

/** Distinct from AGENT_COMMISSION_COLOR so the two red lines read as different things. */
export const DISCOUNT_COLOR = "#d64545"

/** House red for a client-facing caveat bullet (e.g. "Train arrival times cannot be guaranteed").
 *  Reuses AGENT_COMMISSION_COLOR's shade rather than inventing a third red. */
export const WARNING_TEXT_COLOR = "#c0392b"

/** "Travel Dates" — replaces the per-product noun ("Journey"/"Stay"/"Tour", or a Settings
 *  override) on the quote PDF's and quote email's date line. The per-product noun is still used
 *  elsewhere (e.g. the quote-summary's own product label was never anything but this line, so
 *  there is nothing left for it to drive). */
export const TRAVEL_DATES_LABEL = "Travel Dates"

/** "+27 81 580 6471" / "adams@example.com" as separate lines under "Prepared for" — trimmed,
 *  blank fields dropped, phone before email. `[]` when neither is set. */
export function formatPreparedForContact(contact: {
  phone?: string | null
  email?: string | null
}): string[] {
  return [contact.phone, contact.email]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
}

/** "-R500.00" — same subtraction convention as formatAgentCommission. */
export function formatDiscount(amount: number, format: (value: number) => string): string {
  return `-${format(Math.abs(amount))}`
}

/** Suffix on a hotel's check-out line when the property lets guests store luggage at reception. */
const LUGGAGE_STORAGE_NOTE = "Guests can store their luggage at reception."

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

/** "Flights are capped at R2 000pp — incl. baggage & fees" */
export function formatFlightCapLine(amountFormatter: (amount: number) => string, capPerPerson: number): string {
  return `Flights are capped at ${amountFormatter(capPerPerson)}pp — incl. baggage & fees`
}

function journeyRangeOf(blocks: VoucherServiceBlock[]): QuoteJourneyDates | null {
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
 * Journey window derived from the legs actually priced into the quote, not the booking's
 * enquiry-time scalar dates (departure_date/trip_*), which drift out of sync once package legs
 * change. start = earliest date, end = latest.
 *
 * `serviceType`, when given, narrows this to the booking's own primary product (F-P3-4): a
 * "TOUR 18 – 22 November" line built from every leg — a pre-arrival transfer, an add-on hotel —
 * quoted a window that was never the tour's own. Falls back to every block when the primary
 * product has none of its own type dated yet, or when no `serviceType` is passed at all (every
 * caller written before a booking could be headed by something other than a train keeps its exact
 * prior behaviour). Mirrors `deriveTrainDepartureFromBlocks`, which does the same isolation for
 * the header departure date alone.
 */
export function deriveJourneyFromBlocks(
  blocks: VoucherServiceBlock[],
  serviceType?: VoucherServiceBlock["serviceType"],
): QuoteJourneyDates | null {
  if (serviceType) {
    const ownBlocks = blocks.filter((block) => block.serviceType === serviceType)
    const ownRange = journeyRangeOf(ownBlocks)
    if (ownRange) return ownRange
  }
  return journeyRangeOf(blocks)
}

/**
 * The main product's own start date — the earliest block of that service type, by its
 * departureDate — distinct from deriveJourneyFromBlocks, which mixes in hotel pre-nights and other
 * leg kinds. Mirrors the worksheet's top-right date cell (lib/worksheet/build-worksheet-view.ts),
 * which isolates the same leg.
 *
 * `serviceType` defaults to "train" so every caller written before bookings could be headed by
 * something else keeps its exact behaviour. A caller that knows the booking's primary product
 * should pass that product's service type, or {{departureDate}} silently falls back to the
 * enquiry-time booking date on anything that is not a train.
 *
 * Returns null when the booking has no dated leg of that type.
 */
export function deriveTrainDepartureFromBlocks(
  blocks: VoucherServiceBlock[],
  serviceType: VoucherServiceBlock["serviceType"] = "train",
): string | null {
  const dates: string[] = []
  for (const block of blocks) {
    if (block.serviceType !== serviceType) continue
    const parsed = parseIsoDate(block.serviceData.departureDate)
    if (parsed) dates.push(toIsoDateString(parsed))
  }
  if (dates.length === 0) return null
  dates.sort()
  return dates[0]
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

/** "12:00" minus 120 → "10h00". Clamps at 00:00 rather than wrapping into the previous day --
 *  an offset that would cross midnight is a data problem for Settings to catch, not something
 *  this document should silently paper over with a wrong-looking time. Returns null for an
 *  unparseable HH:MM (mirrors formatTimeOfDay). Input is already-formatted "HH:MM", not the
 *  "14h00" house style -- callers pass the raw serviceData.startTime. */
function subtractMinutes(value: string | null | undefined, minutes: number): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  const [hoursRaw, minutesRaw] = trimmed.split(":")
  const hours = Number(hoursRaw)
  const mins = Number(minutesRaw)
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null
  const total = Math.max(0, hours * 60 + mins - minutes)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(Math.floor(total / 60))}h${pad(total % 60)}`
}

/**
 * A train leg's check-in/departure bullets, e.g. "Check in at 10h00" then "Departure time:
 * 12h00" -- shown as two leading bullets ahead of the leg's own inclusions instead of the
 * sentence's old "| Departs at 12h00" suffix (see describeBlock's "train" case).
 *
 * `rawStartTime` is the leg's raw HH:MM (`serviceData.startTime`, before `formatTimeOfDay`) --
 * needed unformatted here because the check-in time is computed by subtracting minutes from it.
 *
 * `offsetMinutes` is the supplier's own suppliers.check_in_offset_minutes (Blue Train and Rovos
 * Rail can differ): 0 means the operator doesn't publish a check-in time at all, so the quote
 * falls back to today's single "Departs at …" wording instead of inventing a check-in line.
 * `undefined`/`null` -- a block built before the column existed -- defaults to 120 (two hours),
 * the historic assumption baked into the reviewer's markup.
 *
 * `[]` (no bullets, sentence keeps its suffix) whenever there's no start time, no usable
 * check-in time, or the offset is explicitly 0.
 */
function buildTrainScheduleBullets(
  rawStartTime: string | null | undefined,
  offsetMinutes: number | null | undefined,
): BulletLine[] {
  const times = trainScheduleTimes(rawStartTime, offsetMinutes)
  if (!times) return []
  return [
    { kind: "item", text: `Check in at ${times.checkIn}` },
    { kind: "item", text: `Departure time: ${times.departure}` },
  ]
}

/** The check-in and departure times behind buildTrainScheduleBullets — null on the same terms. */
function trainScheduleTimes(
  rawStartTime: string | null | undefined,
  offsetMinutes: number | null | undefined,
): { checkIn: string; departure: string } | null {
  const departure = formatTimeOfDay(rawStartTime)
  if (!departure) return null
  const effectiveOffset = offsetMinutes ?? 120
  if (effectiveOffset <= 0) return null
  const checkIn = subtractMinutes(rawStartTime, effectiveOffset)
  if (!checkIn) return null
  return { checkIn, departure }
}

/** "Pretoria → Cape Town" → "Pretoria to Cape Town" — the flowing prose style used in the
 * itinerary line. The quote PDF's embedded Carlito does carry the arrow glyphs; this is a
 * copy-style choice (the line reads as a sentence), not a glyph workaround. */
function toProseRoute(route: string): string {
  return route.replace(/\s*[→↔]\s*/g, " to ")
}

/** "departing at 10h00 for arrival at 12h15" — the flight schedule as the client reads it. Either
 * half stands alone while the other is still unknown, so a half-captured flight still states what
 * it knows instead of falling silent. */
function flightTimesPhrase(start: string | null, end: string | null): string | null {
  if (start && end) return `departing at ${start} for arrival at ${end}`
  if (start) return `departing at ${start}`
  if (end) return `arriving at ${end}`
  return null
}

/** The accommodation nouns a suite/room type ends in — formatSuitePhrase's own (lib/templates/
 *  suite-description.ts) plus the unit kinds suppliers type themselves ("Luxury Tent", "Garden
 *  Villa"). Never the "suite" of an en-suite / En Suite bathroom. Every one pluralises with "s".
 *  "Berth" only counts as the type's last word: "8 Berth Cabin" is a Cabin. */
const SUITE_NOUN_PATTERN =
  /(?<!\ben[-\s]?)\b(Suite|Room|Cabin|Tent|Villa|Chalet|Cottage|Apartment|Bungalow|Lodge|Unit|Compartment|Berth)(s?)\b/gi

/** Where a label's suite/room type ends and its configuration begins: "Twin Room| with en-suite
 *  bathroom", "Deluxe Suite|, Lengthways", "Classic Room| - Garden view". */
const CONFIGURATION_START = /\s+with\s|,|\s-\s/i

/** "Deluxe Suite" → "Deluxe Suites", "Twin bedded Deluxe Suite with a shower" → "Twin bedded Deluxe
 *  Suites with a shower" — the type's own noun (the last one before any configuration) takes the
 *  plural. Null when the type carries none to pluralise. */
function pluralSuiteLabel(label: string): string | null {
  const configurationAt = label.search(CONFIGURATION_START)
  const type = configurationAt >= 0 ? label.slice(0, configurationAt) : label
  const matches = Array.from(type.matchAll(SUITE_NOUN_PATTERN)).filter(
    (match) =>
      match[1].toLowerCase() !== "berth" ||
      type.slice((match.index ?? 0) + match[0].length).trim() === "",
  )
  const last = matches[matches.length - 1]
  if (!last || last.index === undefined) return null
  if (last[2]) return label
  const end = last.index + last[1].length
  return `${label.slice(0, end)}s${label.slice(end)}`
}

/** True when a number is said starting with a vowel sound: 8, 11, 18, 80–89, 800–899, 1100–1199
 *  ("eleven hundred"), 1800–1899, 8 000–8 999, … — read off its leading spoken group. */
function numberTakesAn(value: number): boolean {
  if ((value >= 1100 && value <= 1199) || (value >= 1800 && value <= 1899)) return true
  let lead = value
  while (lead >= 1000) lead = Math.floor(lead / 1000)
  if (lead >= 100) lead = Math.floor(lead / 100)
  return lead === 8 || lead === 11 || lead === 18 || (lead >= 80 && lead <= 89)
}

/** "an" before a vowel sound: "an Executive Room", "an 8 Berth Cabin", but "a One-bedroom Suite",
 *  "a Unique Suite", "a 2 Berth Compartment". */
function indefiniteArticle(label: string): "a" | "an" {
  const leadingNumber = /^\d+/.exec(label)
  if (leadingNumber) return numberTakesAn(Number(leadingNumber[0])) ? "an" : "a"
  if (!/^[aeiou]/i.test(label)) return "a"
  return /^(one\b|one-|once\b|uni|use|usu|uti|ura|ure|uro|eu|ewe|u-)/i.test(label) ? "a" : "an"
}

/** "a Classic Room" | "2 Classic Rooms" | "3 × Presidential" when the label has no noun to pluralise. */
function countedSuiteLabel(label: string, count: number): string {
  if (count <= 1) return `${indefiniteArticle(label)} ${label}`
  const plural = pluralSuiteLabel(label)
  return plural ? `${count} ${plural}` : `${count} × ${label}`
}

/** "a" | "a and b" | "a, b and c". */
function joinNaturally(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ""
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
}

/**
 * The suites/rooms a train or hotel leg books, as its itinerary sentence names them: "a Classic
 * Room", "2 Deluxe Suites", "a Deluxe Suite and 2 Royal Suites". Read off the leg's per-unit counts
 * (itinerarySuiteCounts); a block built before those existed falls back to its single label and
 * numberOfSuites, counted only when the label names one kind of unit. Null when nothing is named.
 */
function suitePhrase(
  label: string | null | undefined,
  counts: VoucherServiceBlock["serviceData"]["itinerarySuiteCounts"],
  numberOfSuites: number | null | undefined,
): string | null {
  const named = (counts ?? []).filter((entry) => entry.label.trim() && entry.count > 0)
  if (named.length > 0) return joinNaturally(named.map((entry) => countedSuiteLabel(entry.label.trim(), entry.count)))
  const trimmed = label?.trim()
  if (!trimmed) return null
  // A joined "Deluxe Suite, Royal Suite" can't say how many of each there are.
  const count = numberOfSuites && numberOfSuites > 1 && !trimmed.includes(",") ? numberOfSuites : 1
  return countedSuiteLabel(trimmed, count)
}

/** "Cape Town Station" → "the Cape Town Station" — skipped when the text already carries an
 * article, so supplier-entered strings like "the hotel" never double up. */
function withLeadingThe(value: string): string {
  return /^the\s/i.test(value) ? value : `the ${value}`
}

/** A line's main clause and the facts trailed onto it ("… | Check in from 14h00"). */
interface Sentence {
  main: string
  tail: string[]
  separator: string
}

function sentence(
  parts: Array<string | null | undefined>,
  suffixes: Array<string | null | undefined>,
  separator = " | ",
): Sentence {
  return {
    main: parts.filter((part): part is string => Boolean(part?.trim())).join(" "),
    tail: suffixes.filter((part): part is string => Boolean(part?.trim())),
    separator,
  }
}

function renderSentence({ main, tail, separator }: Sentence): string {
  return tail.length > 0 ? `${main}${separator}${tail.join(" – ")}` : main
}

function joinSentence(
  parts: Array<string | null | undefined>,
  suffixes: Array<string | null | undefined>,
  separator = " | ",
): string {
  return renderSentence(sentence(parts, suffixes, separator))
}

function describeBlock(block: VoucherServiceBlock): string {
  return renderSentence(describeBlockSentence(block))
}

function describeBlockSentence(block: VoucherServiceBlock): Sentence {
  const d = block.serviceData
  const supplier = block.contactDetails.name?.trim() || null
  const location = block.contactDetails.location?.trim() || null
  const start = formatTimeOfDay(d.startTime)

  switch (block.serviceType) {
    case "hotel": {
      const stay = d.nights && d.nights > 0 ? formatNights(d.nights) : "Stay"
      const at = [supplier, location].filter(Boolean).join(", ")
      const rooms = suitePhrase(d.roomType, d.itinerarySuiteCounts, d.numberOfSuites)
      return sentence(
        [
          `${stay} at ${at ? withLeadingThe(at) : "the hotel"}`,
          rooms ? `in ${rooms}` : null,
          d.mealPlan ? `incl. ${d.mealPlan}` : null,
        ],
        [
          start ? `Check in from ${start}` : null,
          // A comp is still tracked on the block (isComplimentary/isFirstNightComplimentary drive
          // the voucher's callout) but is never spelled out to the client on the quote or the
          // invoice -- the price already reads R0/less, so the word added nothing a client needed
          // and the reviewer struck it from every markup.
        ],
      )
    }
    case "train": {
      // durationDays counts the departure day, so a 3-day journey is 2 nights on board.
      const nights = d.durationDays && d.durationDays > 1 ? d.durationDays - 1 : null
      const onBoard = nights ? `${formatNights(nights)} on` : "On board"
      // itinerarySuiteType is the supplier's chosen quote wording (type name alone, by default);
      // suiteType (the full configuration) is the fallback for blocks built before that field
      // existed. The voucher/invoice keep reading suiteType directly, unaffected by this.
      const suites = suitePhrase(d.itinerarySuiteType ?? d.suiteType, d.itinerarySuiteCounts, d.numberOfSuites)
      // withLeadingThe already skips a supplier name that types its own article ("The Blue
      // Train") -- reused here rather than a bare template literal, which produced "the The Blue
      // Train" on every quote (F-P3-8).
      //
      // The departure time itself only trails the sentence when there's no separate check-in
      // bullet ahead of it (checkInOffsetMinutes 0, or no offset known) -- see
      // buildTrainScheduleBullets, which owns the "Check in at … / Departure time: …" wording.
      const scheduleBullets = buildTrainScheduleBullets(d.startTime, d.checkInOffsetMinutes)
      return sentence(
        [
          `${onBoard} ${supplier ? withLeadingThe(supplier) : "the train"}`,
          suites ? `in ${suites}` : null,
          "on an all-inclusive basis",
          d.route ? `— ${toProseRoute(d.route)}` : null,
        ],
        [scheduleBullets.length === 0 && start ? `Departs at ${start}` : null],
      )
    }
    case "transfer": {
      // Transfer/car-rental supplier identity is never shown to the client — always generic.
      const leg =
        d.pickup && d.dropoff
          ? `from ${withLeadingThe(d.pickup)} to ${withLeadingThe(d.dropoff)}`
          : d.route
            ? `— ${d.route}`
            : null
      // isComplimentary still drives the voucher's callout -- never spelled out on the quote
      // itself, for the same reason as the hotel case above.
      return sentence(
        ["Transfer", leg, d.vehicleType ? `(${d.vehicleType})` : null],
        [start ? `at ${start}` : null],
        " ",
      )
    }
    case "tour": {
      const title = block.title?.trim() || supplier || "Excursion"
      // Leg labels are often already written as "Excursion in Kimberley" — don't say it twice.
      const namesLocation = location ? title.toLowerCase().includes(location.toLowerCase()) : true
      // The tour type is what was booked and priced. d.itinerary (the itinerary's own name) is
      // deliberately never read here: an itinerary has no name field of its own, so that value is
      // either a copy of *some* tour type's name (redundant when it matches this one, misleading
      // when it doesn't — see lib/invoices/describe-invoice-line.ts) or blank. What the itinerary
      // actually has to say lives in d.itineraryDescription, which already leads this block's
      // bullets further down.
      const tourType = d.suiteType?.trim() || null
      const namesTourType = tourType ? title.toLowerCase().includes(tourType.toLowerCase()) : true
      return sentence(
        [
          title,
          namesLocation ? null : `in ${location}`,
          namesTourType ? null : `— ${tourType}`,
        ],
        [start ? `at ${start}` : null],
      )
    }
    case "airline": {
      // The arrival is folded into this sentence only when the flight lands the day it took off.
      // On an overnight flight it would sit under the departure date and read as same-day, so it
      // earns its own dated line instead (see describeEndLine).
      const landsSameDay = Boolean(d.arrivalDate) && d.arrivalDate === d.departureDate
      const end = landsSameDay ? formatTimeOfDay(d.endTime) : null
      return sentence(
        [
          supplier ? `Flight with ${supplier}` : "Flight",
          d.flightNumber,
          d.route ? `— ${toProseRoute(d.route)}` : null,
          d.cabin ? `in ${d.cabin}` : null,
        ],
        [flightTimesPhrase(start, end)],
      )
    }
    default:
      return sentence([block.title?.trim() || supplier || voucherServiceTypeLabel(block.serviceType)], [])
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
      text: joinSentence(
        [end ? `Check out at ${end}` : "Check out"],
        [d.hasLuggageStorage ? LUGGAGE_STORAGE_NOTE : null],
      ),
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
      bullets: [{ kind: "warning", text: "Train arrival times cannot be guaranteed" }],
    }
  }
  if (block.serviceType === "airline") {
    // A same-day arrival already sits in the departure sentence; only an overnight flight needs a
    // line of its own, and it needs one because it falls on a different itinerary date. (The
    // voucher's tabular renderer always prints both as rows — the difference is deliberate: prose
    // reads as one sentence, a table reads as fields.)
    if (d.arrivalDate === d.departureDate) return null
    const where = d.arrivalAirportCode?.trim() || null
    return {
      dateISO: d.arrivalDate,
      text: end
        ? `Flight arrives${where ? ` at ${where}` : ""} at ${end}`
        : `Flight arrives${where ? ` at ${where}` : ""}`,
      bullets: [],
    }
  }
  return null
}

/**
 * The client-facing itinerary. One block can produce two lines — a hotel stay is a check-in line
 * and a separate check-out line on a later date — so lines are re-sorted by date afterwards, then
 * any exact duplicate (same date, same text, same bullets) is collapsed to one.
 *
 * `flightCapBullet` (already formatted, e.g. "Flights are capped at R2 000pp — incl. baggage &
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
    // A hotel's own description (suppliers.description, "External -- visible to clients")
    // replaces its facility bullets outright when the supplier has one on file; the facility
    // list is the fallback for a hotel that hasn't written one yet, not a second thing shown
    // alongside it.
    const hotelDescription =
      block.serviceType === "hotel" ? block.contactDetails.description?.trim() || null : null
    const bullets = hotelDescription ? [] : parseBulletLines(d.inclusions)
    // What the booked itinerary covers, straight off the supplier's itinerary — leads the
    // supplier's standing inclusions because it is specific to this day.
    if (block.serviceType === "tour" && d.itineraryDescription?.trim()) {
      bullets.unshift({ kind: "item", text: d.itineraryDescription.trim() })
    }
    if (block.serviceType === "train") {
      bullets.unshift(...buildTrainScheduleBullets(d.startTime, d.checkInOffsetMinutes))
    }
    // Special requests / allergies (booking_services.notes) are for the operator, not the
    // client -- they belong on the confirmation/voucher (which reads serviceData.notes
    // separately) and never on a document the client themselves reads.
    if (flightCapBullet && !flightCapAttached && block.serviceType === "airline") {
      bullets.push({ kind: "item", text: flightCapBullet })
      flightCapAttached = true
    }

    lines.push({
      dateISO: d.departureDate ?? null,
      text: describeBlock(block),
      bullets,
      ...(hotelDescription ? { description: hotelDescription } : {}),
    })

    const endLine = describeEndLine(block)
    if (endLine) lines.push(endLine)
  })

  // Undated lines keep their position at the end rather than sorting to the front.
  const sorted = lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => {
      const aDate = a.line.dateISO ?? "9999-12-31"
      const bDate = b.line.dateISO ?? "9999-12-31"
      if (aDate !== bDate) return aDate < bDate ? -1 : 1
      return a.index - b.index
    })
    .map((entry) => entry.line)

  // Two stays that land on the same date can produce a byte-identical closing line (a check-out
  // line states no property, just a time — see describeEndLine) even once dates are chained
  // correctly; collapsing them here is a backstop against ever printing the same dated line twice.
  const seen = new Set<string>()
  return sorted.filter((line) => {
    const key = `${line.dateISO ?? ""} ${line.text} ${line.description ?? ""} ${line.bullets.map((b) => `${b.kind}:${b.text}`).join("")}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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

/**
 * One service on a date of the quote PDF's "Travel Package Includes" list: its sentence prints as
 * one bullet, and each of its `details` ("Check in from 14h00", the flight fare cap) as an unbulleted
 * line indented beneath it — one bullet per service, never per line.
 */
export interface QuoteSummaryItem {
  text: string
  details: string[]
}

/** One date of the quote PDF's "Travel Package Includes" list. */
export interface QuoteSummaryDay {
  dateISO: string | null
  items: QuoteSummaryItem[]
}

/**
 * The quote PDF's first-page summary: what happens on each date, one bullet per service, with the
 * supplier inclusions and hotel descriptions left for the separate "Travel Package Details" page
 * (see lib/quotes/pdf/quote-details.ts). Same sentences and ordering as buildQuoteItineraryLines —
 * the email keeps that one untouched — but a stay's or journey's trailing fact ("Check in from
 * 14h00", "Check in at 10h00 - Train departs at 12h00") sits on its own line under the service, a
 * flight's or tour's time runs on in its sentence without the " | " break, and a train's arrival caveat joins
 * its arrival line, as the approved template sets them.
 */
export function buildQuoteSummaryDays(
  blocks: VoucherServiceBlock[],
  flightCapBullet?: string | null,
): QuoteSummaryDay[] {
  const lines: Array<{ dateISO: string | null; items: QuoteSummaryItem[] }> = []
  let flightCapAttached = false

  blocks.forEach((block) => {
    const d = block.serviceData
    const described = describeBlockSentence(block)
    const splitsTail = block.serviceType === "hotel" || block.serviceType === "train"
    // Every other service runs its trailing fact on in the sentence ("… in Economy departing at
    // 10h00", "… Sundowner Cruise at 17h00") — the PDF never prints the email's " | " break.
    const item: QuoteSummaryItem = splitsTail
      ? { text: described.main, details: [...described.tail] }
      : { text: renderSentence({ ...described, separator: " " }), details: [] }

    if (block.serviceType === "train") {
      const times = trainScheduleTimes(d.startTime, d.checkInOffsetMinutes)
      if (times) item.details.push(`Check in at ${times.checkIn} - Train departs at ${times.departure}`)
    }
    if (flightCapBullet && !flightCapAttached && block.serviceType === "airline") {
      item.details.push(flightCapBullet)
      flightCapAttached = true
    }
    lines.push({ dateISO: d.departureDate ?? null, items: [item] })

    const endLine = describeEndLine(block)
    if (endLine) {
      const [headline, ...notes] = endLine.text.split(" | ")
      const warnings = endLine.bullets.filter((bullet) => bullet.kind === "warning").map((bullet) => bullet.text)
      lines.push({ dateISO: endLine.dateISO, items: [{ text: [headline, ...warnings].join(" - "), details: notes }] })
    }
  })

  // Undated lines keep their position at the end rather than sorting to the front.
  const sorted = lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => {
      const aDate = a.line.dateISO ?? "9999-12-31"
      const bDate = b.line.dateISO ?? "9999-12-31"
      if (aDate !== bDate) return aDate < bDate ? -1 : 1
      return a.index - b.index
    })
    .map((entry) => entry.line)

  const days: QuoteSummaryDay[] = []
  const seen = new Set<string>()
  for (const line of sorted) {
    // Same backstop as buildQuoteItineraryLines: two stays ending the same day never print twice.
    const key = `${line.dateISO ?? ""} ${line.items.map((item) => [item.text, ...item.details].join("")).join("")}`
    if (seen.has(key)) continue
    seen.add(key)
    const last = days[days.length - 1]
    if (last && last.dateISO === line.dateISO) last.items.push(...line.items)
    else days.push({ dateISO: line.dateISO, items: [...line.items] })
  }
  return days
}
