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
 * Only rows whose position actually changes are written, nothing at all when the relative order is
 * already right, and all of them in one transaction (set_booking_service_sort_orders). A
 * sort_order-only update does not bump booking_services.updated_at -- the optimistic-lock token the
 * services PATCH checks -- so reordering never 409s anyone editing a leg that didn't move.
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

  // One statement, so a failure leaves the old order whole rather than half rewritten.
  const { error: reorderError } = await supabase.rpc("set_booking_service_sort_orders", {
    p_booking_id: bookingId,
    p_orders: changed.map(({ leg, index }) => ({ id: leg.id, sort_order: index })),
  })
  if (reorderError) return { error: reorderError.message, changedServiceIds: [] }

  return { error: null, changedServiceIds: changed.map(({ leg }) => leg.id) }
}
