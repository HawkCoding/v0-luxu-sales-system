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
