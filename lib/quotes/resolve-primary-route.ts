import { isJourneyRouteKind } from "@/lib/enquiry/primary-product"
import type { createSessionClient } from "@/lib/supabase/server"
import type { PricingSnapshot } from "@/lib/types"

interface SnapshotCarrier {
  pricingSnapshot?: PricingSnapshot | null
}

export interface PrimaryRoute {
  routeId: string | null
  routeName: string | null
  routeReversed: boolean
}

/** Where a resolved primary supplier came from, so an ambiguous multi-primary quote is explainable
 * rather than a silent guess. */
export type PrimarySupplierSource = "booking" | "standalone" | "train" | "first_leg" | "hotel_fallback" | "none"

export interface PrimarySupplierResult {
  supplierId: string | null
  source: PrimarySupplierSource
  /** Every distinct standalone-capable supplier actually priced on the quote, in line-item order.
   * Length > 1 means two eligible primaries were priced on the same quote. */
  candidateIds: string[]
}

export interface PrimarySupplierOptions {
  /** bookings.primary_supplier_id — wins outright when that supplier is actually priced on the quote.
   *
   * Required, not optional: an omitted hint is what let a Shalati quote with a transfer extra resolve
   * the transfer company as its primary supplier and email "your most valued Ulysses Tours &
   * Transfers enquiry". A caller that genuinely has no booking to ask must pass `null` on purpose. */
  bookingPrimarySupplierId: string | null
  /** Supplier ids with suppliers.sells_standalone = true, among those that might be priced. */
  standaloneSupplierIds?: ReadonlySet<string>
}

export interface PrimaryRouteOptions {
  /** The already-resolved primary supplier (see resolvePrimarySupplier) — not the raw booking hint.
   * Required for the same reason as above; pass `null` when nothing is known. */
  primarySupplierId: string | null
}

/**
 * Derives the journey's primary route from quote line-item pricing snapshots. Only kinds whose
 * route names a real origin → destination count: a hotel's route is a meal plan and a tour
 * operator's is an itinerary, neither of which is a direction. Manual lines without snapshots yield
 * nulls.
 *
 * When a primary supplier is already known (see resolvePrimarySupplier) the answer comes from that
 * supplier alone, so the direction shown in an email always agrees with whose template rendered it:
 *
 *  - a journey-shaped route on the primary supplier's own leg wins; otherwise
 *  - if the primary supplier is priced here at all, the booking has NO journey line. It does not
 *    borrow one from an add-on. This is the second half of the Kruger Shalati regression: the old
 *    code stripped hotel legs before looking for the primary supplier, never found it among the
 *    candidates, and fell through to the transfer leg — so syncBookingRoute wrote
 *    "Airport ↔ Shalati" onto the booking as though the stay were a journey there and back.
 *
 * With no primary supplier known (a caller that genuinely has no booking) the old ladder still
 * applies: the train leg wins, then the first snapshot carrying a journey-shaped route.
 */
export function resolvePrimaryRoute(lineItems: SnapshotCarrier[], options: PrimaryRouteOptions): PrimaryRoute {
  const { primarySupplierId } = options
  const snapshots = lineItems.map((li) => li.pricingSnapshot)

  // `supplierKind == null` is deliberately kept in play: it is nullable on PricingSnapshot, and a
  // legacy or manually adapted line with a route but no recorded kind has always contributed one.
  // isJourneyRouteKind answers false for null, so without this arm those lines would silently stop
  // counting.
  const journeySnapshots = snapshots.filter(
    (snapshot): snapshot is PricingSnapshot =>
      Boolean(snapshot?.routeId) &&
      (snapshot?.supplierKind == null || isJourneyRouteKind(snapshot.supplierKind)),
  )

  if (primarySupplierId) {
    const primaryJourney = journeySnapshots.find((snapshot) => snapshot.supplierId === primarySupplierId)
    if (primaryJourney) return toPrimaryRoute(primaryJourney)

    const primaryIsPriced = snapshots.some((snapshot) => snapshot?.supplierId === primarySupplierId)
    if (primaryIsPriced) return NO_ROUTE
  }

  const trainSnapshot = journeySnapshots.find((snapshot) => snapshot.supplierKind === "train_operator")
  return toPrimaryRoute(trainSnapshot ?? journeySnapshots[0] ?? null)
}

const NO_ROUTE: PrimaryRoute = { routeId: null, routeName: null, routeReversed: false }

function toPrimaryRoute(snapshot: PricingSnapshot | null | undefined): PrimaryRoute {
  return {
    routeId: snapshot?.routeId ?? null,
    routeName: snapshot?.routeName ?? null,
    routeReversed: snapshot?.routeReversed ?? false,
  }
}

/**
 * Derives the quote's primary supplier from its line-item pricing snapshots, with full provenance
 * for the ambiguous case (two standalone-capable suppliers priced on one quote):
 *
 *  1. `bookingPrimarySupplierId`, when that supplier is actually priced on this quote.
 *  2. The first leg (in line-item order) whose supplier is in `standaloneSupplierIds`.
 *  3. The first `train_operator` leg (back-compat for callers with no standalone set).
 *  4. The first leg of a kind whose route is a real journey (train, transfers, rental, airline).
 *  5. The first leg with any supplier at all — a stay or a tour wins when nothing else is priced,
 *     since returning null there left a standalone booking with no rate audience, no journey class
 *     and no supplier name on the worksheet.
 *
 * Callers must look the name up in `suppliers` — the snapshot's own `supplierName` is frozen at
 * pricing time and drifts once a supplier is renamed.
 */
export function resolvePrimarySupplier(
  lineItems: SnapshotCarrier[],
  options: PrimarySupplierOptions,
): PrimarySupplierResult {
  const { bookingPrimarySupplierId, standaloneSupplierIds } = options

  const withSupplier = lineItems
    .map((li) => li.pricingSnapshot)
    .filter((snapshot): snapshot is PricingSnapshot => Boolean(snapshot?.supplierId))

  const candidateIds: string[] = []
  if (standaloneSupplierIds) {
    const seen = new Set<string>()
    for (const snapshot of withSupplier) {
      const id = snapshot.supplierId as string
      if (standaloneSupplierIds.has(id) && !seen.has(id)) {
        seen.add(id)
        candidateIds.push(id)
      }
    }
  }

  if (bookingPrimarySupplierId && withSupplier.some((s) => s.supplierId === bookingPrimarySupplierId)) {
    return { supplierId: bookingPrimarySupplierId, source: "booking", candidateIds }
  }

  const standaloneSnapshot = standaloneSupplierIds
    ? withSupplier.find((snapshot) => standaloneSupplierIds.has(snapshot.supplierId as string))
    : undefined
  if (standaloneSnapshot) {
    return { supplierId: standaloneSnapshot.supplierId, source: "standalone", candidateIds }
  }

  // Steps 3-5 only fire for a caller that supplied no standaloneSupplierIds. Every production
  // caller reaches this through loadQuoteConfig, which always supplies them.
  const journeyKindLegs = withSupplier.filter(
    (snapshot) => snapshot.supplierKind == null || isJourneyRouteKind(snapshot.supplierKind),
  )
  const trainSnapshot = journeyKindLegs.find((snapshot) => snapshot.supplierKind === "train_operator")
  if (trainSnapshot) {
    return { supplierId: trainSnapshot.supplierId, source: "train", candidateIds }
  }
  if (journeyKindLegs[0]) {
    return { supplierId: journeyKindLegs[0].supplierId, source: "first_leg", candidateIds }
  }
  if (withSupplier[0]) {
    return { supplierId: withSupplier[0].supplierId, source: "hotel_fallback", candidateIds }
  }
  return { supplierId: null, source: "none", candidateIds }
}

/** Back-compat wrapper for callers that only need the id, not the provenance. */
export function resolvePrimarySupplierId(
  lineItems: SnapshotCarrier[],
  options: PrimarySupplierOptions,
): string | null {
  return resolvePrimarySupplier(lineItems, options).supplierId
}

/**
 * Keeps bookings.route_id in step with the quoted journey. Enquiry intake sets
 * route_id from a fuzzy text match on the caller's free-text direction, which
 * is often wrong — every quote-line write (create or edit) corrects it here so
 * email/voucher/pipeline never read the stale enquiry-time guess.
 *
 * `primarySupplierId` is the booking's own primary supplier: without it a transfer extra on a
 * standalone stay wrote the transfer's route onto the booking. Callers already hold the booking row,
 * so it is passed in rather than queried here.
 *
 * A priced quote that resolves to no route at all — a stay, whose meal plan is not a journey, or a
 * tour, whose itinerary is not a direction — clears route_id rather than leaving the enquiry-time
 * guess standing. A quote with no pricing snapshots at all is a different case: a purely manual
 * quote knows nothing about the journey, so it has nothing to correct and leaves the booking's
 * route untouched.
 */
export async function syncBookingRoute(
  supabase: Awaited<ReturnType<typeof createSessionClient>>,
  bookingId: string,
  lineItems: SnapshotCarrier[],
  primarySupplierId: string | null,
): Promise<{ error: string | null }> {
  const { routeId, routeReversed } = resolvePrimaryRoute(lineItems, { primarySupplierId })
  const pricedByEngine = lineItems.some((li) => Boolean(li.pricingSnapshot?.supplierId))
  if (!routeId && !pricedByEngine) return { error: null }

  const { error } = await supabase
    .from("bookings")
    .update({ route_id: routeId, route_reversed: routeId ? routeReversed : false })
    .eq("id", bookingId)
  return { error: error ? "Failed to sync booking route" : null }
}
