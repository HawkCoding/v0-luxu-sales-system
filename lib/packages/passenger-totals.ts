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

function splitEvenly(total: number, buckets: number): number[] {
  const base = Math.floor(total / buckets)
  const remainder = total % buckets
  return Array.from({ length: buckets }, (_, index) => base + (index < remainder ? 1 : 0))
}

/**
 * Spreads a leg's booking-level passenger totals across its units as evenly as possible, with any
 * remainder landing on the earlier units (3 adults over 2 suites -> 2 + 1). The pricing engine
 * requires the per-unit splits to sum exactly to the booking totals, so this is what lets a
 * freshly auto-built booking price itself without a human redistributing passengers by hand.
 *
 * Each bucket is split independently — adults spread across suites has nothing to do with how
 * many children there are.
 */
export function distributePassengerTotals(
  totals: PassengerTotals,
  unitCount: number,
): PassengerTotals[] {
  if (unitCount <= 0) return []

  const adults = splitEvenly(totals.adultCount, unitCount)
  const children = splitEvenly(totals.childCount, unitCount)
  const infants = splitEvenly(totals.infantCount, unitCount)

  return Array.from({ length: unitCount }, (_, index) => ({
    adultCount: adults[index],
    childCount: children[index],
    infantCount: infants[index],
  }))
}
