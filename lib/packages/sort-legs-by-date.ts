import { formatTimeHHMM } from "@/lib/date-format"
import { dateOnly } from "@/lib/packages/trip-date-range"

/** The bits of a booking leg its date order is decided by. */
export interface DatedLeg {
  id: string
  /** YYYY-MM-DD, or null when the leg has no date yet. */
  date: string | null
  /** HH:MM, or null when the leg states no time of its own. */
  time: string | null
  /** booking_services.sort_order -- the order the salesperson arranged the legs in. */
  sortOrder: number
}

/**
 * Orders a booking's legs by when they happen, so the quote, the invoice and every Build Booking
 * list read as an itinerary rather than in the order services happened to be added.
 *
 * - Earlier date first. Undated legs go last, in the salesperson's own order.
 * - Same day: the salesperson's order (sort_order) decides, exactly as
 *   sortItineraryBlocksChronologically does for the voucher -- a hotel's "check in from" and a
 *   train's departure are not comparable clock events, so they are never sorted against each other.
 * - The one exception on a day: legs that each state a real time of their own (a flight's
 *   departure, a transfer's pickup) are put in clock order among themselves, filling the slots they
 *   already occupied. An untimed leg never moves relative to its neighbours because of a time.
 *
 * Stable and deterministic: legs already in date order come back in the same order, so persisting
 * the result is a no-op for a booking that was built chronologically.
 */
export function sortLegsByDate<T extends DatedLeg>(legs: readonly T[]): T[] {
  const bySortOrder = legs
    .map((leg, index) => ({ leg, index }))
    .sort((a, b) => a.leg.sortOrder - b.leg.sortOrder || a.index - b.index)
    .map(({ leg }) => leg)

  const dated = bySortOrder.filter((leg) => leg.date !== null)
  const undated = bySortOrder.filter((leg) => leg.date === null)

  // Array.prototype.sort is stable, so same-day legs keep their sort_order sequence here.
  const byDate = dated.slice().sort((a, b) => ((a.date as string) < (b.date as string) ? -1 : a.date === b.date ? 0 : 1))

  const result: T[] = []
  let dayStart = 0
  while (dayStart < byDate.length) {
    let dayEnd = dayStart
    while (dayEnd < byDate.length && byDate[dayEnd].date === byDate[dayStart].date) dayEnd += 1
    result.push(...resequenceTimedLegs(byDate.slice(dayStart, dayEnd)))
    dayStart = dayEnd
  }

  return [...result, ...undated]
}

/** Puts the timed legs of one day in clock order within the slots they already hold. */
function resequenceTimedLegs<T extends DatedLeg>(day: T[]): T[] {
  const timed = day.filter((leg) => leg.time !== null)
  if (timed.length < 2) return day
  const inClockOrder = timed.slice().sort((a, b) => ((a.time as string) < (b.time as string) ? -1 : a.time === b.time ? 0 : 1))
  let next = 0
  return day.map((leg) => (leg.time === null ? leg : inClockOrder[next++]))
}

/** True when the two id sequences differ -- i.e. persisting the sorted order would change something. */
export function legOrderChanged(current: readonly { id: string }[], sorted: readonly { id: string }[]): boolean {
  return current.length !== sorted.length || current.some((leg, index) => leg.id !== sorted[index]?.id)
}

const TRANSPORT_KINDS = new Set(["transfers", "vehicle_rental"])

export interface ServiceTimingInput {
  kind: string | null
  /** booking_services.service_date */
  serviceDate: string | null
  /** booking_services.departure_time ("HH:MM" or Postgres "HH:MM:SS"); airline legs only. */
  departureTime?: string | null
  /** Transfer/rental legs: every linked transport request's pickup_at (a UTC instant). */
  pickupAts?: readonly (string | null)[]
}

/**
 * The date and time a leg sorts by. A suite leg (train, hotel, tour, cruise, flight) is dated by
 * its service date, and only a flight carries a time (its departure). A transfer or rental leg has
 * no service date of its own -- it is dated by its earliest pickup, read in APP_TIME_ZONE. A pickup
 * stored at exactly 00:00 is how "date picked, no time typed" is saved (joinAppZoneDateTime), so it
 * counts as no time rather than as a midnight pickup that would jump ahead of the whole day.
 */
export function resolveServiceTiming(input: ServiceTimingInput): { date: string | null; time: string | null } {
  if (input.kind && TRANSPORT_KINDS.has(input.kind)) {
    let earliest: { date: string; time: string | null; instant: number } | null = null
    for (const pickupAt of input.pickupAts ?? []) {
      const date = dateOnly(pickupAt)
      const instant = pickupAt ? Date.parse(pickupAt) : Number.NaN
      if (!date || Number.isNaN(instant)) continue
      if (earliest === null || instant < earliest.instant) {
        const time = formatTimeHHMM(pickupAt)
        earliest = { date, time: time && time !== "00:00" ? time : null, instant }
      }
    }
    return { date: earliest?.date ?? null, time: earliest?.time ?? null }
  }

  const date = dateOnly(input.serviceDate)
  const time = input.kind === "airline" && input.departureTime ? input.departureTime.slice(0, 5) : null
  return { date, time }
}
