import type { PackageLeg, ServiceDateAnchor } from "@/lib/types"

/**
 * Hotel stay dates derived from the train leg they hang off.
 *
 * Every hotel in a package is either a pre-stay (the night(s) before the train departs) or a
 * post-stay (from the day the train arrives). Rather than making the salesperson count days, the
 * anchor + the hotel's night count fully determine the check-in date:
 *
 *   pre  → check-in = departure - nights   (check-out is the morning the train leaves)
 *   post → check-in = arrival              (they get off the train and into a bed that night)
 *
 * Arrival comes from the train route's durationDays, which counts the departure day itself —
 * a 3-day journey leaving on the 10th arrives on the 12th.
 *
 * That's the single-stay rule. A package can also carry *two or more* stays on the same side of
 * the same train — a guest changing hotels mid-visit, joined by a transfer leg between them. Each
 * stay still anchors to the same train, so resolving them independently collapses them onto the
 * same dates (a pre-stay's check-out is always the train's departure day, whatever its night
 * count). {@link resolveChainedHotelStayDates} lays a whole group of same-side stays end to end
 * instead, so only the group's last pre-stay (or first post-stay) touches the train's date and
 * every other stay in the group hands its date to its neighbour.
 */

export function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return date
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

/** Arrival date of a train that departs `departureDate` and runs `durationDays` whole days. */
export function trainArrivalDate(departureDate: string, durationDays: number | null | undefined): string {
  const days = durationDays && durationDays > 0 ? durationDays : 1
  return addDays(departureDate, days - 1)
}

export const TRAIN_LEG_KIND = "train_operator"

export interface AnchorTrain {
  /** Departure date of the anchoring train leg — its service date in the dialog. */
  departureDate: string | null
  /** Duration of the route selected on that train leg; null when the route has none set. */
  durationDays: number | null
}

export interface HotelStayDates {
  checkIn: string
  checkOut: string
}

/** Check-in/check-out for an anchored hotel stay, or null when the anchor can't be resolved
 * (no train leg, no departure date yet, or a manual/custom date). */
export function resolveHotelStayDates(
  anchor: ServiceDateAnchor | null,
  nights: number,
  train: AnchorTrain | null,
): HotelStayDates | null {
  if (anchor !== "pre" && anchor !== "post") return null
  if (!train?.departureDate) return null

  const stayNights = Math.max(1, Math.floor(nights))
  const checkIn =
    anchor === "pre"
      ? addDays(train.departureDate, -stayNights)
      : trainArrivalDate(train.departureDate, train.durationDays)

  return { checkIn, checkOut: addDays(checkIn, stayNights) }
}

/** One stay in an anchor group passed to {@link resolveChainedHotelStayDates}. */
export interface AnchoredStay {
  legId: string
  nights: number
  /** Itinerary position (PackageLeg.sortOrder) — the chain lays stays out in this order. */
  sortOrder: number
}

/**
 * Check-in/check-out for every stay in one anchor group (same train, same side), laid end to end
 * instead of each landing on the train's date independently. A group of one stay returns exactly
 * what {@link resolveHotelStayDates} would for that stay — this is the many-stay generalisation
 * of that function, not a different rule.
 *
 * pre:  the *last* stay (by sortOrder) checks out on the train's departure day; walking backwards,
 *       each earlier stay checks out the day its successor checks in.
 * post: the *first* stay checks in on the train's arrival day; walking forwards, each later stay
 *       checks in the day its predecessor checks out.
 *
 * Returns an empty map when the anchor can't be resolved, matching resolveHotelStayDates's null.
 */
export function resolveChainedHotelStayDates(
  stays: AnchoredStay[],
  anchor: "pre" | "post",
  train: AnchorTrain | null,
): Map<string, HotelStayDates> {
  const result = new Map<string, HotelStayDates>()
  if (!train?.departureDate) return result

  const ordered = stays.slice().sort((a, b) => a.sortOrder - b.sortOrder)

  if (anchor === "pre") {
    let checkOut = train.departureDate
    for (let i = ordered.length - 1; i >= 0; i--) {
      const stayNights = Math.max(1, Math.floor(ordered[i].nights))
      const checkIn = addDays(checkOut, -stayNights)
      result.set(ordered[i].legId, { checkIn, checkOut })
      checkOut = checkIn
    }
    return result
  }

  let checkIn = trainArrivalDate(train.departureDate, train.durationDays)
  for (const stay of ordered) {
    const stayNights = Math.max(1, Math.floor(stay.nights))
    const checkOut = addDays(checkIn, stayNights)
    result.set(stay.legId, { checkIn, checkOut })
    checkIn = checkOut
  }
  return result
}

/**
 * The train leg a hotel anchors to: for a post-stay the nearest train leg *before* it in the
 * itinerary, for a pre-stay the nearest one *after*. Falls back to the nearest train leg in the
 * other direction so a hotel placed at either end of the leg list still resolves (a package with
 * one train — the common case — always resolves to it).
 */
export function findAnchorTrainLeg(
  legs: PackageLeg[],
  hotelLegId: string,
  anchor: ServiceDateAnchor | null,
): PackageLeg | null {
  const ordered = legs.slice().sort((a, b) => a.sortOrder - b.sortOrder)
  const hotelIndex = ordered.findIndex((leg) => leg.id === hotelLegId)
  if (hotelIndex === -1) return null

  const trains = ordered
    .map((leg, index) => ({ leg, index }))
    .filter((entry) => entry.leg.supplierKind === TRAIN_LEG_KIND)
  if (trains.length === 0) return null

  const before = trains.filter((entry) => entry.index < hotelIndex).at(-1)
  const after = trains.find((entry) => entry.index > hotelIndex)

  const preferred = anchor === "post" ? before ?? after : after ?? before
  return preferred?.leg ?? null
}
