import type { SupabaseClient } from "@supabase/supabase-js"
import type { mapPackageDetail } from "@/lib/packages"
import type { Database } from "@/lib/supabase/types"

/** Populates each leg's suite types with the bedroom type / bedroom layout / bathroom type
 * options they're associated with (for the configure step's unit picker dropdowns) — the base
 * suite_types query doesn't carry this, it's a separate M:N vocabulary layered on afterward. */
export async function attachSuiteVariantVocab(
  supabase: SupabaseClient<Database>,
  detail: ReturnType<typeof mapPackageDetail>,
): Promise<void> {
  const suiteTypeIds = Array.from(
    new Set(detail.legs.flatMap((leg) => leg.suiteTypes.map((suiteType) => suiteType.id))),
  )
  if (suiteTypeIds.length === 0) return

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

  const bedroomTypesBySuiteType = groupBy(bedroomTypesResult.data, "bedroom_types")
  const bedroomLayoutsBySuiteType = groupBy(bedroomLayoutsResult.data, "bedroom_layouts")
  const bathroomTypesBySuiteType = groupBy(bathroomTypesResult.data, "bathroom_types")

  for (const leg of detail.legs) {
    for (const suiteType of leg.suiteTypes) {
      const bedroomTypes = bedroomTypesBySuiteType.get(suiteType.id) ?? []
      const bedroomLayouts = bedroomLayoutsBySuiteType.get(suiteType.id) ?? []
      const bathroomTypes = bathroomTypesBySuiteType.get(suiteType.id) ?? []
      suiteType.bedroomTypeIds = bedroomTypes.map((v) => v.id)
      suiteType.bedroomTypes = bedroomTypes.map((v) => v.name)
      suiteType.bedroomLayoutIds = bedroomLayouts.map((v) => v.id)
      suiteType.bedroomLayouts = bedroomLayouts.map((v) => v.name)
      suiteType.bathroomTypeIds = bathroomTypes.map((v) => v.id)
      suiteType.bathroomTypes = bathroomTypes.map((v) => v.name)
    }
  }
}
