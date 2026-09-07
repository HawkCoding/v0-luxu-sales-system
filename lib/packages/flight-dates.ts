import type { PackageDetail, PackageLeg } from "@/lib/types"
import { isCoreBookingLeg } from "@/lib/types"
// Type-only: apply-dialog-state.ts imports resolveTripEdgeDates from this module (a real, runtime
// import), so this direction must stay type-only or the two modules form a require cycle. Same
// pattern trip-date-range.ts already uses for the same reason.
import type { ApplyLegState } from "@/lib/packages/apply-dialog-state"
import type { AnchorTrain, AnchoredStay } from "@/lib/packages/hotel-dates"
import { findAnchorLeg, resolveChainedHotelStayDates } from "@/lib/packages/hotel-dates"
import { selectedRouteDurationDays, serviceDateSpan } from "@/lib/packages/trip-date-range"

/**
 * An airline leg's Pre/Post anchor means the edge of the *whole trip*, not "the day the leg above
 * it starts/ends" -- unlike a transfer, which genuinely does belong to whatever sits directly
 * above it (see transfer-dates.ts), a flight's "before the trip" has to account for any pre-stay
 * hotel nights, or it collapses to the primary product's own departure day (F-P2-4/F-P2-5).
 *
 *   pre  -> the first date the guest must be in place: the earliest pre-anchored hotel check-in
 *           on the primary product, else the primary leg's own start date.
 *   post -> the last date of the trip: the latest post-anchored hotel check-out on the primary
 *           product, else the primary leg's own end date (arrival, for a train/tour route).
 */
export interface TripEdgeDates {
  preDate: string | null
  postDate: string | null
  /** The leg the edges were derived from -- the booking's primary product. */
  primaryLeg: PackageLeg | null
}

/** The booking's primary leg: the one every trip edge measures from. isCoreBookingLeg is the same
 *  identity-or-train-fallback rule findAnchorLeg uses for a hotel's own anchor. */
function findPrimaryLeg(legs: PackageLeg[], primarySupplierId: string | null | undefined): PackageLeg | null {
  const ordered = legs.slice().sort((a, b) => a.sortOrder - b.sortOrder)
  return ordered.find((leg) => isCoreBookingLeg(leg, primarySupplierId ?? null)) ?? null
}

/** The trip's start/end dates, as an airline leg's Pre/Post anchors to them. */
export function resolveTripEdgeDates(
  detail: PackageDetail,
  states: ApplyLegState[],
  primarySupplierId?: string | null,
): TripEdgeDates {
  const primaryLeg = findPrimaryLeg(detail.legs, primarySupplierId)
  if (!primaryLeg) return { preDate: null, postDate: null, primaryLeg: null }

  const primaryState = states.find((state) => state.legId === primaryLeg.id)
  if (primaryState?.kind !== "suite" || !primaryState.serviceDate) {
    return { preDate: null, postDate: null, primaryLeg }
  }

  const routeDurationDays = selectedRouteDurationDays(primaryLeg, primaryState.routeId)
  const span = serviceDateSpan({
    supplierKind: primaryLeg.supplierKind,
    serviceDate: primaryState.serviceDate,
    nights: primaryState.nights,
    routeDurationDays,
    arrivalDate: primaryState.arrivalDate,
  })
  const train: AnchorTrain = { departureDate: primaryState.serviceDate, durationDays: routeDurationDays }

  let preDate = span?.start ?? primaryState.serviceDate
  let postDate = span?.end ?? primaryState.serviceDate

  // Hotel legs pre/post-anchored to this same primary leg push the edge further out -- a pre-stay
  // hotel checking in two nights before departure makes that the trip's real start, not the
  // primary leg's own date. resolveChainedHotelStayDates lays same-side stays end to end exactly
  // as the hotel editor does, so this edge always agrees with what the hotel itself shows.
  const preStays: AnchoredStay[] = []
  const postStays: AnchoredStay[] = []
  for (const state of states) {
    if (state.kind !== "suite" || state.supplierKind !== "hotel_property") continue
    if (state.dateAnchor !== "pre" && state.dateAnchor !== "post") continue
    const anchorLeg = findAnchorLeg(detail.legs, state.legId, state.dateAnchor, primarySupplierId)
    if (!anchorLeg || anchorLeg.id !== primaryLeg.id) continue
    const leg = detail.legs.find((candidate) => candidate.id === state.legId)
    if (!leg) continue
    const stay: AnchoredStay = { legId: state.legId, nights: state.nights ?? 1, sortOrder: leg.sortOrder }
    if (state.dateAnchor === "pre") preStays.push(stay)
    else postStays.push(stay)
  }

  if (preStays.length > 0) {
    for (const dates of resolveChainedHotelStayDates(preStays, "pre", train).values()) {
      if (preDate === null || dates.checkIn < preDate) preDate = dates.checkIn
    }
  }
  if (postStays.length > 0) {
    for (const dates of resolveChainedHotelStayDates(postStays, "post", train).values()) {
      if (postDate === null || dates.checkOut > postDate) postDate = dates.checkOut
    }
  }

  return { preDate, postDate, primaryLeg }
}
