import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { BookingInputRow } from "./types"

type Client = SupabaseClient<Database>

/**
 * Resolves each booking's product — the thing it was actually sold on — so reports follow what the
 * salesperson priced. The booking number carries no product information, which is why it is not
 * used here.
 *
 * Two sources, in order:
 *
 *  1. bookings.primary_supplier_id. Set at intake for anything headed by a supplier ticked "can be
 *     the main product", whatever its kind. This is the only source that works for a standalone
 *     stay or a cruise: syncBookingRoute deliberately clears route_id on those, because a meal plan
 *     or an itinerary is not a journey — so they reached the route lookup below with nothing to
 *     look up and were reported as "Unassigned" while the reporting page happily offered them in
 *     its Product filter.
 *  2. route_id → routes.supplier_id, train operators only, for bookings that predate the column.
 *     The kind filter stays deliberately narrow here: on an older booking a route is as likely to
 *     belong to a transfer add-on as to the product, and attributing revenue to a transfer company
 *     would be worse than leaving it unassigned.
 *
 * Bookings matching neither keep null, rendered as "Unassigned".
 */
export async function withProductSuppliers(
  supabase: Client,
  bookings: BookingInputRow[],
): Promise<BookingInputRow[]> {
  const primarySupplierIds = Array.from(
    new Set(bookings.map((b) => b.primary_supplier_id).filter((id): id is string => Boolean(id))),
  )
  const routeIds = Array.from(
    new Set(
      bookings
        .filter((b) => !b.primary_supplier_id)
        .map((b) => b.route_id)
        .filter((id): id is string => Boolean(id)),
    ),
  )

  const supplierById = new Map<string, { id: string; name: string }>()
  if (primarySupplierIds.length > 0) {
    const { data: suppliers } = await supabase
      .from("suppliers")
      .select("id, name")
      .in("id", primarySupplierIds)
    for (const supplier of suppliers ?? []) {
      supplierById.set(supplier.id, { id: supplier.id, name: supplier.name })
    }
  }

  const supplierByRouteId = new Map<string, { id: string; name: string }>()
  if (routeIds.length > 0) {
    const { data: routes } = await supabase
      .from("routes")
      .select("id, supplier:suppliers(id, name, kind)")
      .in("id", routeIds)

    for (const route of routes ?? []) {
      const supplier = route.supplier
      if (!supplier || supplier.kind !== "train_operator") continue
      supplierByRouteId.set(route.id, { id: supplier.id, name: supplier.name })
    }
  }

  return bookings.map((b) => {
    const supplier =
      (b.primary_supplier_id ? supplierById.get(b.primary_supplier_id) : null) ??
      (b.route_id ? supplierByRouteId.get(b.route_id) : null) ??
      null

    return {
      ...b,
      product_supplier_id: supplier?.id ?? null,
      product_supplier_name: supplier?.name ?? null,
    }
  })
}
