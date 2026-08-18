import type { PackageLeg, ServiceDateAnchor, SupplierKind } from "@/lib/types"

/**
 * A transfer's pickup date derived from the leg directly above it in the itinerary — not from the
 * train the way a hotel's stay dates are (see hotel-dates.ts). A booking's legs are a flat ordered
 * list (train, transfer, hotel, transfer, ...) and each transfer belongs to whatever sits just
 * above it, so there is no single service every transfer could anchor to the way every hotel
 * anchors to "the" train.
 *
 *   pre  → the day the leg above starts
 *   post → the day the leg above ends
 *
 * "Starts"/"ends" is the same span every other date-derived feature already uses — see
 * serviceDateSpan in trip-date-range.ts, which this leans on rather than re-deriving train
 * arrival dates or hotel checkout dates a second time.
 */

const TRANSPORT_LEG_KINDS = new Set<SupplierKind>(["transfers", "vehicle_rental"])

export interface AnchorLegDates {
  start: string | null
  end: string | null
}

/** pre → the anchor leg's start date, post → its end date, custom/null → not derived. */
export function resolveTransferPickupDate(
  anchor: ServiceDateAnchor | null,
  anchorDates: AnchorLegDates | null,
): string | null {
  if (!anchorDates) return null
  if (anchor === "pre") return anchorDates.start
  if (anchor === "post") return anchorDates.end
  return null
}

/**
 * The leg a transfer's pickup date hangs off: the nearest leg above it (by sortOrder) that is
 * itself not a transfer/rental. Two transfers stacked under one train both walk past each other to
 * the same train. Unlike a hotel's train anchor there is no fallback in the other direction — "the
 * leg above" is directional, so a transfer with nothing dated above it (it opens the itinerary, or
 * only other transport legs precede it) simply has no anchor.
 */
export function findTransferAnchorLeg(legs: PackageLeg[], transferLegId: string): PackageLeg | null {
  const ordered = legs.slice().sort((a, b) => a.sortOrder - b.sortOrder)
  const index = ordered.findIndex((leg) => leg.id === transferLegId)
  if (index === -1) return null

  for (let i = index - 1; i >= 0; i -= 1) {
    if (!TRANSPORT_LEG_KINDS.has(ordered[i].supplierKind)) return ordered[i]
  }
  return null
}
