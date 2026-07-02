import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

export interface SuiteVariantAllowedIds {
  bedroomTypeIds: Set<string>
  bedroomLayoutIds: Set<string>
  bathroomTypeIds: Set<string>
}

/** Looks up, per suite type, which bedroom type / bedroom layout / bathroom type ids are
 * actually associated with it (via the suite_type_* join tables) — used to validate that a
 * unit's chosen variant combination is one the suite type actually offers. */
export async function loadAllowedSuiteVariantIds(
  supabase: SupabaseClient<Database>,
  suiteTypeIds: string[],
): Promise<Map<string, SuiteVariantAllowedIds>> {
  const uniqueIds = Array.from(new Set(suiteTypeIds))
  const result = new Map<string, SuiteVariantAllowedIds>()
  if (uniqueIds.length === 0) return result

  const [bedroomTypesResult, bedroomLayoutsResult, bathroomTypesResult] = await Promise.all([
    supabase.from("suite_type_bedroom_types").select("suite_type_id, bedroom_type_id").in("suite_type_id", uniqueIds),
    supabase.from("suite_type_bedroom_layouts").select("suite_type_id, bedroom_layout_id").in("suite_type_id", uniqueIds),
    supabase.from("suite_type_bathroom_types").select("suite_type_id, bathroom_type_id").in("suite_type_id", uniqueIds),
  ])

  function ensure(suiteTypeId: string): SuiteVariantAllowedIds {
    let entry = result.get(suiteTypeId)
    if (!entry) {
      entry = { bedroomTypeIds: new Set(), bedroomLayoutIds: new Set(), bathroomTypeIds: new Set() }
      result.set(suiteTypeId, entry)
    }
    return entry
  }

  for (const row of bedroomTypesResult.data ?? []) {
    ensure(row.suite_type_id).bedroomTypeIds.add(row.bedroom_type_id)
  }
  for (const row of bedroomLayoutsResult.data ?? []) {
    ensure(row.suite_type_id).bedroomLayoutIds.add(row.bedroom_layout_id)
  }
  for (const row of bathroomTypesResult.data ?? []) {
    ensure(row.suite_type_id).bathroomTypeIds.add(row.bathroom_type_id)
  }

  return result
}

export interface SuiteUnitVariantSelection {
  suiteTypeId: string
  bedroomTypeId?: string | null
  bedroomLayoutId?: string | null
  bathroomTypeId?: string | null
}

/** Returns the field name of the first variant that isn't allowed for its suite type, or null
 * if the whole selection is valid (or the suite type has no vocab at all, in which case any
 * value is rejected as unset since there's nothing to choose from). */
export function findInvalidVariantField(
  selection: SuiteUnitVariantSelection,
  allowedByShapeType: Map<string, SuiteVariantAllowedIds>,
): "bedroomTypeId" | "bedroomLayoutId" | "bathroomTypeId" | null {
  const allowed = allowedByShapeType.get(selection.suiteTypeId)

  if (selection.bedroomTypeId && !(allowed?.bedroomTypeIds.has(selection.bedroomTypeId) ?? false)) {
    return "bedroomTypeId"
  }
  if (selection.bedroomLayoutId && !(allowed?.bedroomLayoutIds.has(selection.bedroomLayoutId) ?? false)) {
    return "bedroomLayoutId"
  }
  if (selection.bathroomTypeId && !(allowed?.bathroomTypeIds.has(selection.bathroomTypeId) ?? false)) {
    return "bathroomTypeId"
  }
  return null
}
