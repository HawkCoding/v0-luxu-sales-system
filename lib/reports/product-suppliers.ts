import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { BookingInputRow } from "./types"

type Client = SupabaseClient<Database>

/**
 * Resolves each booking's product (the train operator actually booked) from
 * route_id → routes.supplier_id → suppliers, so reports follow the package the
 * salesperson priced. syncBookingRoute (lib/quotes/resolve-primary-route.ts)
 * rewrites route_id on every quote-line write, so this stays correct when the
 * train changes; the booking number never did, which is why it is not used here.
 *
 * Only train operators count as a product — hotel "routes" are meal plans, not
 * journeys, matching the exclusion in resolvePrimaryRoute. Bookings with no
 * train leg priced yet keep null (rendered as "Unassigned").
 */
export async function withProductSuppliers(
  supabase: Client,
  bookings: BookingInputRow[],
): Promise<BookingInputRow[]> {
  const routeIds = Array.from(
    new Set(bookings.map((b) => b.route_id).filter((id): id is string => Boolean(id))),
  )
  if (routeIds.length === 0) {
    return bookings.map((b) => ({ ...b, product_supplier_id: null, product_supplier_name: null }))
  }

  const { data: routes } = await supabase
    .from("routes")
    .select("id, supplier:suppliers(id, name, kind)")
    .in("id", routeIds)

  const supplierByRouteId = new Map<string, { id: string; name: string }>()
  for (const route of routes ?? []) {
    const supplier = route.supplier
    if (!supplier || supplier.kind !== "train_operator") continue
    supplierByRouteId.set(route.id, { id: supplier.id, name: supplier.name })
  }

  return bookings.map((b) => {
    const supplier = b.route_id ? supplierByRouteId.get(b.route_id) ?? null : null
    return {
      ...b,
      product_supplier_id: supplier?.id ?? null,
      product_supplier_name: supplier?.name ?? null,
    }
  })
}
