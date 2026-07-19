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

/**
 * Derives the journey's primary route from quote line-item pricing snapshots.
 * The train leg wins (it names the journey, e.g. "Pretoria ↔ Cape Town");
 * otherwise the first snapshot that carries a route is used. Hotel legs are
 * excluded — their "route" is a meal plan, not a journey direction. Manual
 * lines without snapshots yield nulls.
 */
export function resolvePrimaryRoute(lineItems: SnapshotCarrier[]): PrimaryRoute {
  const snapshots = lineItems
    .map((li) => li.pricingSnapshot)
    .filter(
      (snapshot): snapshot is PricingSnapshot =>
        Boolean(snapshot?.routeId) && snapshot?.supplierKind !== "hotel_property",
    )

  const trainSnapshot = snapshots.find((snapshot) => snapshot.supplierKind === "train_operator")
  const winner = trainSnapshot ?? snapshots[0] ?? null

  return {
    routeId: winner?.routeId ?? null,
    routeName: winner?.routeName ?? null,
    routeReversed: winner?.routeReversed ?? false,
  }
}

/**
 * Keeps bookings.route_id in step with the quoted journey. Enquiry intake sets
 * route_id from a fuzzy text match on the caller's free-text direction, which
 * is often wrong — every quote-line write (create or edit) corrects it here so
 * email/voucher/pipeline never read the stale enquiry-time guess.
 */
export async function syncBookingRoute(
  supabase: Awaited<ReturnType<typeof createSessionClient>>,
  bookingId: string,
  lineItems: SnapshotCarrier[],
): Promise<{ error: string | null }> {
  const { routeId, routeReversed } = resolvePrimaryRoute(lineItems)
  if (!routeId) return { error: null }

  const { error } = await supabase
    .from("bookings")
    .update({ route_id: routeId, route_reversed: routeReversed })
    .eq("id", bookingId)
  return { error: error ? "Failed to sync booking route" : null }
}
