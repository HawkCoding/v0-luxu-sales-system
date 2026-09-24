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
  return sortByDateAndClock(legs, (leg) => ({ date: leg.date, time: leg.time, order: leg.sortOrder }))
}

/** What sortByDateAndClock orders an item by. */
export interface DateClockKey {
  /** YYYY-MM-DD, or null when undated. */
  date: string | null
  /** HH:MM of a real clock event (a flight's departure, a transfer's pickup), else null. */
  time: string | null
  /** The salesperson's own order. */
  order: number
}

/**
 * The ordering rule behind sortLegsByDate, over any item. The saved leg order and the itinerary
 * blocks on the voucher, itinerary and quote PDFs (sortItineraryBlocksChronologically) both sort
 * through here, so the two can never disagree about which of two same-day legs comes first.
 */
export function sortByDateAndClock<T>(items: readonly T[], keyOf: (item: T) => DateClockKey): T[] {
  const keyed = items.map((item, index) => ({ item, key: keyOf(item), index }))
  const byOrder = keyed.sort((a, b) => a.key.order - b.key.order || a.index - b.index)

  const dated = byOrder.filter((entry) => entry.key.date !== null)
  const undated = byOrder.filter((entry) => entry.key.date === null)

  // Array.prototype.sort is stable, so same-day items keep their order sequence here.
  const byDate = dated
    .slice()
    .sort((a, b) => ((a.key.date as string) < (b.key.date as string) ? -1 : a.key.date === b.key.date ? 0 : 1))

  const result: T[] = []
  let dayStart = 0
  while (dayStart < byDate.length) {
    let dayEnd = dayStart
    while (dayEnd < byDate.length && byDate[dayEnd].key.date === byDate[dayStart].key.date) dayEnd += 1
    result.push(...resequenceTimed(byDate.slice(dayStart, dayEnd)).map(({ item }) => item))
    dayStart = dayEnd
  }

  return [...result, ...undated.map(({ item }) => item)]
}

/** Puts the timed items of one day in clock order within the slots they already hold. */
function resequenceTimed<E extends { key: DateClockKey }>(day: E[]): E[] {
  const timed = day.filter((entry) => entry.key.time !== null)
  if (timed.length < 2) return day
  const inClockOrder = timed
    .slice()
    .sort((a, b) => ((a.key.time as string) < (b.key.time as string) ? -1 : a.key.time === b.key.time ? 0 : 1))
  let next = 0
  return day.map((entry) => (entry.key.time === null ? entry : inClockOrder[next++]))
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
