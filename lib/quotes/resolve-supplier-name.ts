import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { PricingSnapshot } from "@/lib/types"
import { resolvePrimarySupplierId } from "@/lib/quotes/resolve-primary-route"
import { firstRecord } from "@/lib/utils"

/**
 * Resolves the supplier name shown to the customer for {{supplierName}} in
 * any email. Prefers the booking's most recent quote's primary supplier
 * (quoted train leg, same precedence as resolvePrimarySupplierId), falling
 * back to the booking's route supplier, then its hotel supplier.
 */
export async function resolveBookingSupplierName(
  supabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<string> {
  const { data: quotes } = await supabase
    .from("quotes")
    .select("id, created_at")
    .eq("booking_id", bookingId)

  const latestQuoteId = (quotes ?? [])
    .slice()
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0]?.id

  if (latestQuoteId) {
    const { data: lineItems } = await supabase
      .from("quote_line_items")
      .select("pricing_snapshot")
      .eq("quote_id", latestQuoteId)

    const supplierId = resolvePrimarySupplierId(
      (lineItems ?? []).map((li) => ({ pricingSnapshot: li.pricing_snapshot as PricingSnapshot | null })),
    )

    if (supplierId) {
      const { data: supplier } = await supabase
        .from("suppliers")
        .select("name")
        .eq("id", supplierId)
        .maybeSingle()
      if (supplier?.name) return supplier.name
    }
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
