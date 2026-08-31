import type { SupabaseClient } from "@supabase/supabase-js"
import type { mapPackageDetail } from "@/lib/packages"
import type { Database } from "@/lib/supabase/types"

export interface SuiteVariantVocab {
  bedroomTypesBySuiteType: Map<string, { id: string; name: string }[]>
  bedroomLayoutsBySuiteType: Map<string, { id: string; name: string }[]>
  bathroomTypesBySuiteType: Map<string, { id: string; name: string }[]>
}

function groupBy<TKey extends string>(
  rows: { suite_type_id: string }[] | null | undefined,
  key: TKey,
): Map<string, { id: string; name: string }[]> {
  const result = new Map<string, { id: string; name: string }[]>()
  for (const row of rows ?? []) {
    const value = (row as unknown as Record<TKey, { id: string; name: string } | null>)[key]
    if (!value) continue
    const list = result.get(row.suite_type_id) ?? []
    list.push(value)
    result.set(row.suite_type_id, list)
  }
  return result
}

/** Reads the bedroom type / bedroom layout / bathroom type options each suite type is associated
 * with — the M:N vocabulary the base suite_types query doesn't carry. Split from
 * `applySuiteVariantVocab` below so a caller building a PackageDetail from several joins can fire
 * this alongside its other independent reads instead of waiting on the mapped detail first. */
export async function fetchSuiteVariantVocab(
  supabase: SupabaseClient<Database>,
  suiteTypeIds: readonly string[],
): Promise<SuiteVariantVocab> {
  if (suiteTypeIds.length === 0) {
    return {
      bedroomTypesBySuiteType: new Map(),
      bedroomLayoutsBySuiteType: new Map(),
      bathroomTypesBySuiteType: new Map(),
    }
  }

  const [bedroomTypesResult, bedroomLayoutsResult, bathroomTypesResult] = await Promise.all([
    supabase
      .from("suite_type_bedroom_types")
      .select("suite_type_id, bedroom_types(id, name)")
      .in("suite_type_id", suiteTypeIds),
    supabase
      .from("suite_type_bedroom_layouts")
      .select("suite_type_id, bedroom_layouts(id, name)")
      .in("suite_type_id", suiteTypeIds),
    supabase
      .from("suite_type_bathroom_types")
      .select("suite_type_id, bathroom_types(id, name)")
      .in("suite_type_id", suiteTypeIds),
  ])

  return {
    bedroomTypesBySuiteType: groupBy(bedroomTypesResult.data, "bedroom_types"),
    bedroomLayoutsBySuiteType: groupBy(bedroomLayoutsResult.data, "bedroom_layouts"),
    bathroomTypesBySuiteType: groupBy(bathroomTypesResult.data, "bathroom_types"),
  }
}

/** Populates each leg's suite types (mutating them in place) with the vocab `fetchSuiteVariantVocab`
 * read — for the configure step's unit picker dropdowns. */
export function applySuiteVariantVocab(
  detail: ReturnType<typeof mapPackageDetail>,
  vocab: SuiteVariantVocab,
): void {
  for (const leg of detail.legs) {
    for (const suiteType of leg.suiteTypes) {
      const bedroomTypes = vocab.bedroomTypesBySuiteType.get(suiteType.id) ?? []
      const bedroomLayouts = vocab.bedroomLayoutsBySuiteType.get(suiteType.id) ?? []
      const bathroomTypes = vocab.bathroomTypesBySuiteType.get(suiteType.id) ?? []
      suiteType.bedroomTypeIds = bedroomTypes.map((v) => v.id)
      suiteType.bedroomTypes = bedroomTypes.map((v) => v.name)
      suiteType.bedroomLayoutIds = bedroomLayouts.map((v) => v.id)
      suiteType.bedroomLayouts = bedroomLayouts.map((v) => v.name)
      suiteType.bathroomTypeIds = bathroomTypes.map((v) => v.id)
      suiteType.bathroomTypes = bathroomTypes.map((v) => v.name)
    }
  }
}

/** Populates each leg's suite types with the bedroom type / bedroom layout / bathroom type
 * options they're associated with (for the configure step's unit picker dropdowns) — the base
 * suite_types query doesn't carry this, it's a separate M:N vocabulary layered on afterward.
 *
 * Convenience wrapper over fetchSuiteVariantVocab + applySuiteVariantVocab for a caller that
 * already has the mapped detail and no other reads to run concurrently with this one. */
export async function attachSuiteVariantVocab(
  supabase: SupabaseClient<Database>,
  detail: ReturnType<typeof mapPackageDetail>,
): Promise<void> {
  const suiteTypeIds = Array.from(
    new Set(detail.legs.flatMap((leg) => leg.suiteTypes.map((suiteType) => suiteType.id))),
  )
  const vocab = await fetchSuiteVariantVocab(supabase, suiteTypeIds)
  applySuiteVariantVocab(detail, vocab)
}
