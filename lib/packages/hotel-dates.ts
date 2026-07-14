import type { HotelDateAnchor, PackageLeg } from "@/lib/types"

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
  anchor: HotelDateAnchor | null,
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

/**
 * The train leg a hotel anchors to: for a post-stay the nearest train leg *before* it in the
 * itinerary, for a pre-stay the nearest one *after*. Falls back to the nearest train leg in the
 * other direction so a hotel placed at either end of the leg list still resolves (a package with
 * one train — the common case — always resolves to it).
 */
export function findAnchorTrainLeg(
  legs: PackageLeg[],
  hotelLegId: string,
  anchor: HotelDateAnchor | null,
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
