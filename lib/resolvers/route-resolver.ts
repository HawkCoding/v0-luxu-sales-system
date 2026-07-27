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

/**
 * Resolves free-text direction wording to a route id by decomposing it into an endpoint pair and
 * matching against `routes`, honouring `direction_mode` (one_way routes must match origin/
 * destination in order; round_trip/loop match either order). Shared by the enquiries API and the
 * inbound-email importer.
 *
 * Never guesses: more than one candidate route for the same endpoint pair — with or without a
 * known supplier — means the pair alone can't disambiguate, so this returns null rather than
 * silently taking the first row the query happened to return.
 */
export async function findRouteId(
  supabase: ServiceClient,
  direction: unknown,
  supplierId: string | null = null,
): Promise<string | null> {
  if (typeof direction !== "string" || !direction.trim()) return null

  const { data: locations } = await supabase.from("locations").select("id, name")
  const endpoints = extractDirectionLocationIds(direction, locations ?? [])
  if (!endpoints) return null
  const [firstLocId, secondLocId] = endpoints

  let routesQuery = supabase
    .from("routes")
    .select("id, origin_location_id, destination_location_id, direction_mode")
    .eq("active", true)
  if (supplierId) {
    routesQuery = routesQuery.eq("supplier_id", supplierId)
  }
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

  if (matches.length === 1) return matches[0].id
  return null
}
