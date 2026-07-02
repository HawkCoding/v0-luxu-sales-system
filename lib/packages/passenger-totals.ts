import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { fetchDefaultAgeBuckets, resolveAgeBuckets } from "@/lib/pricing/age-buckets"

export interface PassengerTotals {
  adultCount: number
  childCount: number
  infantCount: number
}

/** Booking-level adult/child/infant totals for a given leg's supplier (age-bucket overrides are
 * supplier-scoped), used to validate that per-unit passenger splits on a train/tour leg sum to
 * the booking's actual traveller counts. Mirrors the bucketing in lib/quotes/build-from-package.ts. */
export async function computeLegPassengerTotals(
  supabase: SupabaseClient<Database>,
  params: {
    noOfAdults: number
    noOfChildren: number
    childAges: number[]
    supplierId: string | null
  },
): Promise<PassengerTotals> {
  const defaultBuckets = await fetchDefaultAgeBuckets(supabase)

  let override: { infantMaxAge: number | null; childMaxAge: number | null } | null = null
  if (params.supplierId) {
    const { data } = await supabase
      .from("suppliers")
      .select("infant_max_age, child_max_age")
      .eq("id", params.supplierId)
      .maybeSingle()
    if (data) {
      override = { infantMaxAge: data.infant_max_age ?? null, childMaxAge: data.child_max_age ?? null }
    }
  }

  const buckets = resolveAgeBuckets(defaultBuckets, override)
  const infantCount = params.childAges.filter((age) => age <= buckets.infantMax).length
  const adultPromotedCount = params.childAges.filter((age) => age > buckets.childMax).length
  const childCount = Math.max(0, params.noOfChildren - infantCount - adultPromotedCount)
  const adultCount = params.noOfAdults + adultPromotedCount

  return { adultCount, childCount, infantCount }
}
