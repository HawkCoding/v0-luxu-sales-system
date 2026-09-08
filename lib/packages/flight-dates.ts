import type { PackageLeg } from "@/lib/types"
import { TRANSPORT_LEG_KINDS } from "@/lib/packages/transfer-dates"

/**
 * An airline leg's Pre/Post anchor means the leg directly above it in the itinerary — the same
 * "belongs to whatever sits just above it" rule a transfer already follows (see
 * transfer-dates.ts), not the whole trip's edges. Two flights stacked one under the other chain:
 * the lower one anchors to the upper one's own departure/arrival dates, so a connecting flight
 * follows its first leg.
 *
 *   pre  → the anchor leg's start date
 *   post → the anchor leg's end date
 *
 * A transfer/rental leg is skipped when walking up, the same way it is for a transfer's own
 * anchor — it never carries a service date of its own to anchor to. A flight sitting at the top
 * of the list (nothing dated above it) falls back to the nearest qualifying leg *below* it,
 * matching the fallback {@link findAnchorLeg} in hotel-dates.ts already uses — an outbound flight
 * placed first still resolves instead of being stuck on "Custom date".
 */

/** The leg a flight's Pre/Post anchor hangs off: the nearest non-transport leg above it by
 *  sortOrder, falling back to the nearest one below when nothing above qualifies (or the flight
 *  opens the itinerary). Returns null only when no other dateable leg exists at all. */
export function findFlightAnchorLeg(legs: PackageLeg[], flightLegId: string): PackageLeg | null {
  const ordered = legs.slice().sort((a, b) => a.sortOrder - b.sortOrder)
  const index = ordered.findIndex((leg) => leg.id === flightLegId)
  if (index === -1) return null

  for (let i = index - 1; i >= 0; i -= 1) {
    if (!TRANSPORT_LEG_KINDS.has(ordered[i].supplierKind)) return ordered[i]
  }
  for (let i = index + 1; i < ordered.length; i += 1) {
    if (!TRANSPORT_LEG_KINDS.has(ordered[i].supplierKind)) return ordered[i]
  }
  return null
}
