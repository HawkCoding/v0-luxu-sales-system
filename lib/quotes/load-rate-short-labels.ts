import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { PricingSnapshot } from "@/lib/types"
import { readPaxGroups } from "@/lib/quotes/pax-group-pricing"

/** Every rate type a set of lines priced at: the line's own and each unitRef's (a rate slice). */
export function collectRateTypeIds(lines: readonly { pricing_snapshot: unknown }[]): string[] {
  const ids = new Set<string>()
  for (const line of lines) {
    const value = line.pricing_snapshot
    if (!value || typeof value !== "object") continue
    const snapshot = value as PricingSnapshot
    if (snapshot.rateTypeId) ids.add(snapshot.rateTypeId)
    for (const ref of snapshot.unitRefs ?? []) {
      if (ref?.rateTypeId) ids.add(ref.rateTypeId)
    }
  }
  return [...ids]
}

/**
 * rate_types.short_label ("SA", "TW") by id for the rate types these lines priced at — the tags
 * allocatePaxGroups prints after a pax-group price. A blank label comes back as null.
 *
 * Skips the query when the lines carry no pax groups (the labels print nowhere else) or no rate type.
 * Never throws: a failed read returns an empty map, so a document prints its lines without tags
 * rather than failing over a label.
 */
export async function loadRateShortLabels(
  supabase: SupabaseClient<Database>,
  lines: readonly { pricing_snapshot: unknown }[],
): Promise<Map<string, string | null>> {
  const labels = new Map<string, string | null>()
  if (!readPaxGroups(lines)) return labels
  const ids = collectRateTypeIds(lines)
  if (ids.length === 0) return labels
  try {
    const { data, error } = await supabase.from("rate_types").select("id, short_label").in("id", ids)
    if (error || !data) return labels
    for (const row of data) labels.set(row.id, row.short_label?.trim() || null)
  } catch {
    return new Map()
  }
  return labels
}
