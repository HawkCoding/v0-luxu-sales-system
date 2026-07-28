import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { fetchDefaultAgeBuckets, resolveAgeBuckets, type AgeBuckets } from "@/lib/pricing/age-buckets"

export interface PassengerTotals {
  adultCount: number
  childCount: number
  infantCount: number
}

/** Bucket a booking's raw (no_of_adults, no_of_children, child_ages) into what the pricing engine
 * actually charges for: an age past childMax is an adult (fewer "children" than no_of_children
 * says), an age at or below infantMax doesn't count against the child total either. Pure and sync
 * so it can run in a client component's live preview, not just server routes.
 * The single source of truth for this arithmetic — do not re-derive it inline elsewhere. */
export function projectPassengerTotals(
  input: { noOfAdults: number; noOfChildren: number; childAges: number[] },
  buckets: AgeBuckets,
): PassengerTotals {
  const infantCount = input.childAges.filter((age) => age <= buckets.infantMax).length
  const adultPromotedCount = input.childAges.filter((age) => age > buckets.childMax).length
  const childCount = Math.max(0, input.noOfChildren - infantCount - adultPromotedCount)
  const adultCount = input.noOfAdults + adultPromotedCount
  return { adultCount, childCount, infantCount }
}

/** The change to apply to bookings.no_of_adults so the projection re-derives to exactly `summed`
 * — a delta, not `summed.adultCount` itself. Since child_ages (and therefore adultPromotedCount)
 * doesn't change, `noOfAdults + delta` is the unique value that converges in one write. Returns
 * null when child or infant counts differ too — those can only be fixed by editing child_ages,
 * there's no booking-level number for them to write. */
export function resolveAdultsOnlyDelta(totals: PassengerTotals, summed: PassengerTotals): number | null {
  if (summed.childCount !== totals.childCount || summed.infantCount !== totals.infantCount) return null
  return summed.adultCount - totals.adultCount
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
  const buckets = await resolveSupplierAgeBuckets(supabase, params.supplierId)
  return projectPassengerTotals(params, buckets)
}

/** Age buckets for a single supplier — split out of computeLegPassengerTotals so callers that
 * need the buckets themselves (e.g. to preview a projection client-side) don't have to re-fetch. */
export async function resolveSupplierAgeBuckets(
  supabase: SupabaseClient<Database>,
  supplierId: string | null,
): Promise<AgeBuckets> {
  const defaultBuckets = await fetchDefaultAgeBuckets(supabase)

  let override: { infantMaxAge: number | null; childMaxAge: number | null } | null = null
  if (supplierId) {
    const { data } = await supabase
      .from("suppliers")
      .select("infant_max_age, child_max_age")
      .eq("id", supplierId)
      .maybeSingle()
    if (data) {
      override = { infantMaxAge: data.infant_max_age ?? null, childMaxAge: data.child_max_age ?? null }
    }
  }

  return resolveAgeBuckets(defaultBuckets, override)
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
