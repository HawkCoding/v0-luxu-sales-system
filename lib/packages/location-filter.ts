import type { Location, Supplier, SupplierKind } from "@/lib/types"

/**
 * A leg shape minimal enough for destination derivation. Both the package wizard's
 * `SelectablePackageLeg` and a `PackageDetail` leg satisfy this.
 */
interface LegWithRoutes {
  supplierKind: SupplierKind
  routes: { destinationLocationId: string | null }[]
}

/**
 * The set of destination location IDs that anchor the soft supplier filter: the
 * destinations of every train route across the package's train-operator legs.
 */
export function getDestinationLocationIds(legs: LegWithRoutes[]): string[] {
  const ids = new Set<string>()
  for (const leg of legs) {
    if (leg.supplierKind !== "train_operator") continue
    for (const route of leg.routes) {
      if (route.destinationLocationId) {
        ids.add(route.destinationLocationId)
      }
    }
  }
  return Array.from(ids)
}

/**
 * Expand destination IDs to the full set of acceptable location IDs, walking the
 * city <-> sub-area hierarchy in both directions: a destination city accepts its
 * sub-areas, and a destination sub-area accepts its parent city.
 */
function buildAcceptableLocationIds(destinationIds: string[], locations: Location[]): Set<string> {
  const acceptable = new Set(destinationIds)
  const dest = new Set(destinationIds)

  for (const location of locations) {
    // Child of a destination city (e.g. "Waterfront" when destination is "Cape Town").
    if (location.parentLocationId && dest.has(location.parentLocationId)) {
      acceptable.add(location.id)
    }
    // Parent of a destination sub-area (e.g. "Cape Town" when destination is "Waterfront").
    if (dest.has(location.id) && location.parentLocationId) {
      acceptable.add(location.parentLocationId)
    }
  }

  return acceptable
}

/**
 * Soft match: a supplier is considered "in the destination area" when its tagged
 * location or sub-area falls within the acceptable set. Suppliers with no location
 * tag are unscoped, not scoped-to-nowhere, so they always match.
 */
export function supplierMatchesDestination(
  supplier: Pick<Supplier, "locationId" | "locationAreaId">,
  destinationIds: string[],
  locations: Location[],
): boolean {
  if (destinationIds.length === 0) return true
  if (!supplier.locationId && !supplier.locationAreaId) return true

  const acceptable = buildAcceptableLocationIds(destinationIds, locations)
  if (supplier.locationId && acceptable.has(supplier.locationId)) return true
  if (supplier.locationAreaId && acceptable.has(supplier.locationAreaId)) return true
  return false
}

/**
 * Convenience: human-readable names of the destination locations, for the
 * "Showing hotels in {names}" caption.
 */
export function getDestinationNames(destinationIds: string[], locations: Location[]): string[] {
  const byId = new Map(locations.map((location) => [location.id, location.name]))
  return destinationIds.map((id) => byId.get(id)).filter((name): name is string => Boolean(name))
}
