import type { SupabaseClient } from "@supabase/supabase-js"
import { projectPassengerTotals, resolveSupplierAgeBuckets } from "@/lib/packages/passenger-totals"
import type { Database } from "@/lib/supabase/types"

export interface BookingPaxRow {
  no_of_adults: number | null
  no_of_children: number | null
  child_ages: number[] | null
}

/** Adults and paying children as the pricing engine charges them. */
export interface PayingPax {
  adults: number
  children: number
}

/**
 * Whose age buckets decide the paying headcount: the quote's resolved primary supplier
 * (loadQuoteConfig's primarySupplierId, derived from the priced lines), else the booking's own
 * primary_supplier_id. The quote PDF and the invoice both resolve it this way, so the two documents
 * always divide by the same people.
 */
export function payingPaxSupplierId(
  quotePrimarySupplierId: string | null | undefined,
  bookingPrimarySupplierId: string | null | undefined,
): string | null {
  return quotePrimarySupplierId ?? bookingPrimarySupplierId ?? null
}

/**
 * The headcount a document's "Total for N Adults & M Children" label and its "Total per Adult/Child"
 * rows divide by. bookings.no_of_children counts every child the enquiry named: an infant (free,
 * never a "Child" fare) and a child past the supplier's child age (priced as an adult) are both in
 * it. Projected through the primary supplier's age buckets — the same projection the voucher and
 * the pricing engine use (lib/packages/passenger-totals.ts) — so the rows divide by the people who
 * actually pay each fare. Infants are left out entirely. Age-bucket lookups that fail fall back to
 * the house defaults (resolveSupplierAgeBuckets), so this never blocks a document from rendering.
 */
export async function resolvePayingPax(
  supabase: SupabaseClient<Database>,
  booking: BookingPaxRow | null | undefined,
  primarySupplierId: string | null,
): Promise<PayingPax> {
  if (!booking) return { adults: 0, children: 0 }
  const buckets = await resolveSupplierAgeBuckets(supabase, primarySupplierId)
  const totals = projectPassengerTotals(
    {
      noOfAdults: booking.no_of_adults ?? 0,
      noOfChildren: booking.no_of_children ?? 0,
      childAges: booking.child_ages ?? [],
    },
    buckets,
  )
  return { adults: totals.adultCount, children: totals.childCount }
}
