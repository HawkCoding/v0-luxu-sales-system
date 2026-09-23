import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { legOrderChanged, resolveServiceTiming, sortLegsByDate } from "@/lib/packages/sort-legs-by-date"

interface SupplierKindJoin {
  kind: string
}

export interface PersistServiceDateOrderResult {
  error: string | null
  /** Services whose sort_order was rewritten. Empty when the booking was already in date order. */
  changedServiceIds: string[]
}

/**
 * Re-sorts a booking's services into date order (see sortLegsByDate) and persists
 * booking_services.sort_order, so every reader that walks the legs by sort_order -- the pricing
 * engine and therefore the quote and invoice lines, Build Booking's step 1 and 2 lists, the voucher
 * -- follows the itinerary.
 *
 * Only rows whose position actually changes are written, and nothing is written at all when the
 * relative order is already right: sort_order updates bump booking_services.updated_at, the
 * optimistic-lock token the services PATCH checks, so a no-op rewrite would 409 the salesperson's
 * very next save. Callers that write here must hand the fresh versions back to the client.
 */
export async function persistServiceDateOrder(
  supabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<PersistServiceDateOrderResult> {
  const [servicesResult, transportResult] = await Promise.all([
    supabase
      .from("booking_services")
      .select("id, sort_order, service_date, departure_time, suppliers(kind)")
      .eq("booking_id", bookingId),
    supabase
      .from("booking_transport_requests")
      .select("service_id, pickup_at")
      .eq("booking_id", bookingId),
  ])

  if (servicesResult.error) return { error: servicesResult.error.message, changedServiceIds: [] }
  if (transportResult.error) return { error: transportResult.error.message, changedServiceIds: [] }

  const pickupsByServiceId = new Map<string, (string | null)[]>()
  for (const request of transportResult.data ?? []) {
    if (!request.service_id) continue
    const list = pickupsByServiceId.get(request.service_id) ?? []
    list.push(request.pickup_at)
    pickupsByServiceId.set(request.service_id, list)
  }

  const legs = (servicesResult.data ?? []).map((row) => {
    const supplier = (Array.isArray(row.suppliers) ? row.suppliers[0] : row.suppliers) as SupplierKindJoin | null
    const timing = resolveServiceTiming({
      kind: supplier?.kind ?? null,
      serviceDate: row.service_date,
      departureTime: row.departure_time,
      pickupAts: pickupsByServiceId.get(row.id) ?? [],
    })
    return { id: row.id, sortOrder: row.sort_order, date: timing.date, time: timing.time }
  })

  const current = legs.slice().sort((a, b) => a.sortOrder - b.sortOrder)
  const sorted = sortLegsByDate(legs)
  if (!legOrderChanged(current, sorted)) return { error: null, changedServiceIds: [] }

  const changed = sorted
    .map((leg, index) => ({ leg, index }))
    .filter(({ leg, index }) => leg.sortOrder !== index)

  const results = await Promise.all(
    changed.map(({ leg, index }) =>
      supabase
        .from("booking_services")
        .update({ sort_order: index })
        .eq("booking_id", bookingId)
        .eq("id", leg.id),
    ),
  )
  const firstError = results.find((result) => result.error)?.error
  if (firstError) return { error: firstError.message, changedServiceIds: [] }

  return { error: null, changedServiceIds: changed.map(({ leg }) => leg.id) }
}
