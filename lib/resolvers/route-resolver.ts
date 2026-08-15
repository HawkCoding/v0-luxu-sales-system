import { normalizeLookupValue } from "@/lib/normalize-lookup-value"
import type { createServiceClient } from "@/lib/supabase/server"

type ServiceClient = ReturnType<typeof createServiceClient>

/**
 * Pulls the two endpoint location ids out of free-text direction wording (e.g. "Pretoria to
 * Cape Town") by scanning the known location names — longest first so "Cape Town" wins over a
 * bare token — and ordering them by where they first appear. Returns the first two distinct hits.
 */
export function extractDirectionLocationIds(
  direction: string,
  locations: Array<{ id: string; name: string }>,
): [string, string] | null {
  const haystack = normalizeLookupValue(direction)
  if (!haystack) return null

  const hits: Array<{ id: string; index: number }> = []
  const ordered = [...locations].sort((a, b) => b.name.length - a.name.length)
  for (const location of ordered) {
    const needle = normalizeLookupValue(location.name)
    if (!needle) continue
    const pattern = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`)
    const match = pattern.exec(haystack)
    if (match && !hits.some((hit) => hit.id === location.id)) {
      hits.push({ id: location.id, index: match.index })
    }
  }

  if (hits.length < 2) return null
  hits.sort((a, b) => a.index - b.index)
  return [hits[0].id, hits[1].id]
}

export interface RouteMatch {
  routeId: string | null
  /** True when the customer named the route's destination before its origin (e.g. the route is
   *  filed as Pretoria -> Cape Town but the enquiry said "Cape Town to Pretoria"). Always false
   *  for one_way routes, which can only ever match in their filed order. */
  reversed: boolean
}

const NO_MATCH: RouteMatch = { routeId: null, reversed: false }

interface RouteCandidate {
  id: string
  name: string | null
  origin_location_id: string | null
  destination_location_id: string | null
  direction_mode: string | null
  duration_days: number | null
}

/**
 * Orders candidate routes that share an endpoint pair so the same enquiry always resolves to the
 * same route. An endpoint pair alone genuinely can't disambiguate (Pretoria -> Victoria Falls is
 * both the round-trip "Victoria Falls Journey" and the one-way "Southern Cross Tour"), so this is
 * a deliberate heuristic, not a certainty:
 *
 *   1. round_trip before one_way -- the operator's scheduled flagship journey is the far more
 *      common enquiry than a one-way special.
 *   2. shorter duration_days first, unset last -- a shorter journey is the more conservative pick.
 *   3. name A-Z -- an arbitrary but stable last resort, so the ordering is total.
 *
 * Every step is derived from the row's own data, which is what makes this reproducible where
 * "take whatever row Postgres returned first" was not.
 */
function compareRouteCandidates(a: RouteCandidate, b: RouteCandidate): number {
  const roundTripRank = (route: RouteCandidate) => (route.direction_mode === "one_way" ? 1 : 0)
  const modeDelta = roundTripRank(a) - roundTripRank(b)
  if (modeDelta !== 0) return modeDelta

  const durationRank = (route: RouteCandidate) =>
    typeof route.duration_days === "number" ? route.duration_days : Number.POSITIVE_INFINITY
  const durationDelta = durationRank(a) - durationRank(b)
  if (durationDelta !== 0) return durationDelta

  return (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" })
}

/**
 * Resolves free-text direction wording to a route id (and which way round it was travelled) by
 * decomposing it into an endpoint pair and matching against `routes`, honouring `direction_mode`
 * (one_way routes must match origin/destination in order; round_trip/loop match either order).
 * Shared by the enquiries API and the inbound-email importer.
 *
 * More than one candidate route for the same endpoint pair is resolved by `compareRouteCandidates`
 * rather than abandoned -- an unresolved route leaves the booking with no rate cards and no way to
 * price a quote, which is worse than a reproducible best guess a consultant can correct. Nothing
 * is flagged when the tie-break fires, by design.
 *
 * That tie-break is scoped to ONE operator, which is why `supplierId` is mandatory in practice:
 * with no operator the search widened to every route in the table and cheerfully returned another
 * operator's route for an enquiry that never named them (an "Orient Express" enquiry came back with
 * The Blue Train's Pretoria <-> Cape Town). Choosing between operators is not a tie-break, it is a
 * guess, so an unresolved operator now resolves no route at all -- the raw direction wording is
 * still kept on the booking, and the consultant picking the operator resolves the route with it.
 */
export async function findRouteMatch(
  supabase: ServiceClient,
  direction: unknown,
  supplierId: string | null = null,
): Promise<RouteMatch> {
  if (typeof direction !== "string" || !direction.trim()) return NO_MATCH
  if (!supplierId) return NO_MATCH

  const { data: locations } = await supabase.from("locations").select("id, name")
  const endpoints = extractDirectionLocationIds(direction, locations ?? [])
  if (!endpoints) return NO_MATCH
  const [firstLocId, secondLocId] = endpoints

  const routesQuery = supabase
    .from("routes")
    .select("id, name, origin_location_id, destination_location_id, direction_mode, duration_days")
    .eq("active", true)
    .eq("supplier_id", supplierId)
  const { data: routes } = await routesQuery

  const matches = (routes ?? []).filter((route) => {
    const origin = route.origin_location_id
    const destination = route.destination_location_id
    if (!origin || !destination) return false
    if (route.direction_mode === "one_way") {
      return origin === firstLocId && destination === secondLocId
    }
    // round_trip / loop: order-independent endpoint pair
    return (
      (origin === firstLocId && destination === secondLocId) ||
      (origin === secondLocId && destination === firstLocId)
    )
  })

  if (matches.length === 0) return NO_MATCH
  const route = matches.length === 1 ? matches[0] : [...matches].sort(compareRouteCandidates)[0]
  // one_way already had to match in filed order to be a candidate at all; round_trip/loop
  // travelled reversed exactly when the customer's first-named endpoint is the route's
  // destination, not its origin.
  const reversed = route.direction_mode !== "one_way" && route.origin_location_id === secondLocId
  return { routeId: route.id, reversed }
}

/** Back-compat wrapper for callers that only need the id. Prefer `findRouteMatch`. */
export async function findRouteId(
  supabase: ServiceClient,
  direction: unknown,
  supplierId: string | null = null,
): Promise<string | null> {
  return (await findRouteMatch(supabase, direction, supplierId)).routeId
}
