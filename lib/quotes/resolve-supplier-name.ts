import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { firstRecord } from "@/lib/utils"

/**
 * Resolves the supplier name shown to the customer for {{supplierName}} in any email.
 *
 * `primarySupplierId`, when given, is trusted as-is (it should be the same id a caller passes to
 * composeEmail's templateSupplierId, e.g. via resolveSharedEmailTokens) so the name shown and the
 * template variant rendered can never disagree. Falls back to the booking's route supplier, then
 * its hotel supplier, when no primary is known (a booking predating primary_supplier_id with no
 * quote yet).
 */
export async function resolveBookingSupplierName(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  primarySupplierId?: string | null,
): Promise<string> {
  if (primarySupplierId) {
    const { data: supplier } = await supabase
      .from("suppliers")
      .select("name")
      .eq("id", primarySupplierId)
      .maybeSingle()
    if (supplier?.name) return supplier.name
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "route:routes(supplier:suppliers(name)), hotel_supplier:suppliers!bookings_hotel_supplier_id_fkey(name)",
    )
    .eq("id", bookingId)
    .maybeSingle()

  const route = firstRecord(booking?.route)
  const routeSupplier = firstRecord(route?.supplier)
  const hotelSupplier = firstRecord(booking?.hotel_supplier)

  return routeSupplier?.name ?? hotelSupplier?.name ?? "Supplier"
}
