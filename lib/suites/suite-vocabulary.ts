import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { SupplierDetail } from "@/lib/types"
import { loadAllowedSuiteVariantIds } from "@/lib/packages/suite-config"

export type SuiteAxis = "suiteType" | "bedroomType" | "bedroomLayout" | "bathroomType"

export interface SuiteVocabEntry {
  id: string
  name: string
}

export interface SuiteTypeVocabEntry extends SuiteVocabEntry {
  bedroomTypeIds: ReadonlySet<string>
  bedroomLayoutIds: ReadonlySet<string>
  bathroomTypeIds: ReadonlySet<string>
}

export interface SuiteAliasEntry {
  axis: SuiteAxis
  /** Already normalized (lib/suites/suite-phrase-tokens.ts). */
  phrase: string
  targetId: string
  status: "provisional" | "confirmed"
}

export interface SuiteVocabulary {
  supplierId: string
  /** Active suite types only. */
  suiteTypes: SuiteTypeVocabEntry[]
  /** Non-archived vocab entries only. */
  bedroomTypes: SuiteVocabEntry[]
  bedroomLayouts: SuiteVocabEntry[]
  bathroomTypes: SuiteVocabEntry[]
  aliases: SuiteAliasEntry[]
}

const AXIS_BY_DB_VALUE: Record<string, SuiteAxis> = {
  suite_type: "suiteType",
  bedroom_type: "bedroomType",
  bedroom_layout: "bedroomLayout",
  bathroom_type: "bathroomType",
}

function targetIdForAliasRow(row: {
  suite_type_id: string | null
  bedroom_type_id: string | null
  bedroom_layout_id: string | null
  bathroom_type_id: string | null
}): string | null {
  return row.suite_type_id ?? row.bedroom_type_id ?? row.bedroom_layout_id ?? row.bathroom_type_id ?? null
}

/**
 * Loads everything needed to resolve a raw suite/room phrase for one supplier: its active suite
 * types (with each one's allowed bedroom/layout/bathroom id sets), its non-archived vocab, and
 * its learned aliases. Server-side only (queries suite_vocab_aliases + the vocab tables).
 */
export async function loadSupplierSuiteVocabulary(
  supabase: SupabaseClient<Database>,
  supplierId: string,
): Promise<SuiteVocabulary> {
  const [suiteTypesResult, bedroomTypesResult, bedroomLayoutsResult, bathroomTypesResult, aliasesResult] =
    await Promise.all([
      supabase
        .from("suite_types")
        .select("id, name")
        .eq("supplier_id", supplierId)
        .eq("active", true),
      supabase
        .from("bedroom_types")
        .select("id, name")
        .eq("supplier_id", supplierId)
        .is("archived_at", null),
      supabase
        .from("bedroom_layouts")
        .select("id, name")
        .eq("supplier_id", supplierId)
        .is("archived_at", null),
      supabase
        .from("bathroom_types")
        .select("id, name")
        .eq("supplier_id", supplierId)
        .is("archived_at", null),
      supabase
        .from("suite_vocab_aliases")
        .select("axis, phrase, status, suite_type_id, bedroom_type_id, bedroom_layout_id, bathroom_type_id")
        .eq("supplier_id", supplierId),
    ])

  const suiteTypeRows = suiteTypesResult.data ?? []
  const allowedByShapeType = await loadAllowedSuiteVariantIds(
    supabase,
    suiteTypeRows.map((row) => row.id),
  )

  const suiteTypes: SuiteTypeVocabEntry[] = suiteTypeRows.map((row) => {
    const allowed = allowedByShapeType.get(row.id)
    return {
      id: row.id,
      name: row.name,
      bedroomTypeIds: allowed?.bedroomTypeIds ?? new Set(),
      bedroomLayoutIds: allowed?.bedroomLayoutIds ?? new Set(),
      bathroomTypeIds: allowed?.bathroomTypeIds ?? new Set(),
    }
  })

  const aliases: SuiteAliasEntry[] = (aliasesResult.data ?? []).flatMap((row) => {
    const axis = AXIS_BY_DB_VALUE[row.axis]
    const targetId = targetIdForAliasRow(row)
    if (!axis || !targetId) return []
    return [{ axis, phrase: row.phrase, targetId, status: row.status }]
  })

  return {
    supplierId,
    suiteTypes,
    bedroomTypes: bedroomTypesResult.data ?? [],
    bedroomLayouts: bedroomLayoutsResult.data ?? [],
    bathroomTypes: bathroomTypesResult.data ?? [],
    aliases,
  }
}

/**
 * Pure adapter so client code (the review modal) can build a SuiteVocabulary from the
 * SupplierDetail payload it already has, without a second fetch. `aliases` is populated only
 * when SupplierDetail carries `suiteAliases` (added alongside this module).
 */
export function suiteVocabularyFromSupplierDetail(
  detail: SupplierDetail & { suiteAliases?: SuiteAliasEntry[] },
): SuiteVocabulary {
  const suiteTypes: SuiteTypeVocabEntry[] = detail.suiteTypes
    .filter((suiteType) => suiteType.active)
    .map((suiteType) => ({
      id: suiteType.id,
      name: suiteType.name,
      bedroomTypeIds: new Set(suiteType.bedroomTypeIds ?? []),
      bedroomLayoutIds: new Set(suiteType.bedroomLayoutIds ?? []),
      bathroomTypeIds: new Set(suiteType.bathroomTypeIds ?? []),
    }))

  const notArchived = (entry: { archivedAt: string | null }) => !entry.archivedAt

  return {
    supplierId: detail.id,
    suiteTypes,
    bedroomTypes: detail.bedroomTypes.filter(notArchived).map((entry) => ({ id: entry.id, name: entry.name })),
    bedroomLayouts: detail.bedroomLayouts.filter(notArchived).map((entry) => ({ id: entry.id, name: entry.name })),
    bathroomTypes: detail.bathroomTypes.filter(notArchived).map((entry) => ({ id: entry.id, name: entry.name })),
    aliases: detail.suiteAliases ?? [],
  }
}
