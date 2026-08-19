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

/** The pair of airport codes an airline route travels between, in booked-direction order. */
export interface RouteEndpointCodes {
  departure: string
  arrival: string
}

/** The separator between the two halves of a route name. Only the first one splits. */
const ROUTE_ENDPOINT_SEPARATOR = /\s*(?:>|<|→|←|↔|–|—|-|\/)\s*|\s+to\s+/i

/** IATA is 3 letters, ICAO 4 — the same shape `booking_services` and its Zod schema enforce. */
const AIRPORT_CODE = /^[A-Z]{3,4}$/

/**
 * Reads the two airport codes out of an airline route's name, e.g. `"CPT > ORT"` -> CPT/ORT.
 *
 * The route name is the only place these codes exist: `locations` carries no IATA/ICAO column, so
 * the route's origin and destination records can only supply prose ("Cape Town INT Airport"), and
 * the codes an airline uses are not derivable from an airport's name ("King Shaka INT Airport" is
 * DUR). Airline routes are the one kind whose name is hand-typed (`routeNameAutoDerived: false`),
 * and it is typed as exactly this code pair.
 *
 * Returns null unless both halves are already valid codes — a prose name like "Cape Town to
 * Johannesburg" must yield nothing rather than something the API would reject.
 */
export function parseRouteEndpointCodes(
  routeName: string | null | undefined,
): RouteEndpointCodes | null {
  if (!routeName) return null
  const parts = routeName.trim().split(ROUTE_ENDPOINT_SEPARATOR)
  if (parts.length !== 2) return null

  const departure = parts[0].trim().toUpperCase()
  const arrival = parts[1].trim().toUpperCase()
  if (!AIRPORT_CODE.test(departure) || !AIRPORT_CODE.test(arrival)) return null

  return { departure, arrival }
}

/**
 * The route's airport codes in the direction actually booked — the same swap
 * `resolveDirectedRouteName` applies to the route label, so a flight's From/To always agrees with
 * the `origin → destination` sentence rendered next to it.
 */
export function resolveDirectedEndpointCodes(
  routeName: string | null | undefined,
  reversed: boolean,
): RouteEndpointCodes | null {
  const codes = parseRouteEndpointCodes(routeName)
  if (!codes) return null
  return reversed ? { departure: codes.arrival, arrival: codes.departure } : codes
}
