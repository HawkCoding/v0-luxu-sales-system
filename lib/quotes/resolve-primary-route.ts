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
 * Derives the journey's primary route from quote line-item pricing snapshots. Hotel legs are
 * excluded — their "route" is a meal plan, not a journey direction. Manual lines without snapshots
 * yield nulls.
 *
 * When a primary supplier is already known (see resolvePrimarySupplier), a route carried by that
 * supplier's own leg wins first, so the direction shown in an email always agrees with whose
 * template rendered it. Otherwise: the train leg wins (it names the journey, e.g. "Pretoria ↔ Cape
 * Town"), then the first snapshot that carries a route.
 *
 * A standalone hotel booking (Kruger Shalati) prices nothing but hotel legs, and its meal plan
 * still is not a journey — so it deliberately resolves to no route at all rather than passing a
 * meal plan off as a direction. resolvePrimarySupplier is the one that falls back.
 */
export function resolvePrimaryRoute(lineItems: SnapshotCarrier[], options: PrimaryRouteOptions): PrimaryRoute {
  const { primarySupplierId } = options
  const snapshots = lineItems
    .map((li) => li.pricingSnapshot)
    .filter(
      (snapshot): snapshot is PricingSnapshot =>
        Boolean(snapshot?.routeId) && snapshot?.supplierKind !== "hotel_property",
    )

  const primarySnapshot = primarySupplierId
    ? snapshots.find((snapshot) => snapshot.supplierId === primarySupplierId)
    : undefined
  const trainSnapshot = snapshots.find((snapshot) => snapshot.supplierKind === "train_operator")
  const winner = primarySnapshot ?? trainSnapshot ?? snapshots[0] ?? null

  return {
    routeId: winner?.routeId ?? null,
    routeName: winner?.routeName ?? null,
    routeReversed: winner?.routeReversed ?? false,
  }
}

/**
 * Derives the quote's primary supplier from its line-item pricing snapshots, with full provenance
 * for the ambiguous case (two standalone-capable suppliers priced on one quote):
 *
 *  1. `bookingPrimarySupplierId`, when that supplier is actually priced on this quote.
 *  2. The first leg (in line-item order) whose supplier is in `standaloneSupplierIds`.
 *  3. The first `train_operator` leg (back-compat for callers with no standalone set).
 *  4. The first non-hotel leg.
 *  5. The first leg with any supplier at all — a hotel wins when nothing else is priced, since
 *     returning null there left a standalone stay with no rate audience, no journey class and no
 *     supplier name on the worksheet.
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

  const nonHotel = withSupplier.filter((snapshot) => snapshot.supplierKind !== "hotel_property")
  const trainSnapshot = nonHotel.find((snapshot) => snapshot.supplierKind === "train_operator")
  if (trainSnapshot) {
    return { supplierId: trainSnapshot.supplierId, source: "train", candidateIds }
  }
  if (nonHotel[0]) {
    return { supplierId: nonHotel[0].supplierId, source: "first_leg", candidateIds }
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
 * A priced quote that resolves to no route at all — a hotel-only stay, whose meal plan is not a
 * journey — clears route_id rather than leaving the enquiry-time guess standing. A quote with no
 * pricing snapshots at all is a different case: a purely manual quote knows nothing about the
 * journey, so it has nothing to correct and leaves the booking's route untouched.
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
