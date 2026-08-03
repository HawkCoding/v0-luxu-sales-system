import type { RouteDirectionMode } from "@/lib/types"

/**
 * Builds the canonical, locked display name for a point-to-point (train) route from its
 * endpoints and direction. One-way routes use a single arrow; round trips a double arrow.
 *
 * This is the single source of truth for train-route naming, reused by the supplier editor
 * (display), the quick-add dialog, and the server save handler (which overwrites whatever the
 * client sends so the name stays constant regardless of input).
 */
/**
 * Coerces a raw `direction_mode` value from the database into the supported app-level union.
 * The Postgres enum still carries the retired `loop` value, so legacy rows are folded into
 * `round_trip` (both are bidirectional) until any such data is migrated away.
 */
export function normalizeRouteDirectionMode(value: string | null | undefined): RouteDirectionMode {
  return value === "round_trip" || value === "loop" ? "round_trip" : "one_way"
}

export function buildRouteName(
  originName: string,
  destinationName: string,
  directionMode: RouteDirectionMode,
): string {
  const origin = originName.trim()
  const destination = destinationName.trim()
  const separator = directionMode === "round_trip" ? "↔" : "→"
  return `${origin} ${separator} ${destination}`
}

/**
 * Resolves the route name as it should read on a booking's documents (quote, voucher, itinerary,
 * invoice, emails). Unlike the canonical two-way name (`A ↔ B`) shown in the supplier admin, a
 * document always renders the actual booked travel direction with a one-way arrow: non-reversed is
 * `origin → destination`, reversed swaps the endpoints to `destination → origin`.
 */
export function resolveDirectedRouteName(
  originName: string,
  destinationName: string,
  reversed: boolean,
): string {
  return reversed
    ? buildRouteName(destinationName, originName, "one_way")
    : buildRouteName(originName, destinationName, "one_way")
}

/**
 * The station a leg actually arrives at, given the booked direction — the same swap
 * `resolveDirectedRouteName` applies to the route label, so the arrival station on client
 * documents always agrees with the route sentence next to it.
 */
export function resolveDirectedArrivalName(
  originName: string,
  destinationName: string,
  reversed: boolean,
): string {
  return reversed ? originName : destinationName
}
