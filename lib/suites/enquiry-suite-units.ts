import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, Json } from "@/lib/supabase/types"
import { findInvalidVariantField, loadAllowedSuiteVariantIds } from "@/lib/packages/suite-config"
import { normalizeLookupValue } from "@/lib/normalize-lookup-value"
import { resolveSuitePhrase } from "@/lib/suites/resolve-suite-phrase"
import { loadSupplierSuiteVocabulary, type SuiteAxis, type SuiteVocabulary } from "@/lib/suites/suite-vocabulary"

type Client = SupabaseClient<Database>

/** A suite unit as it arrives from a client — every id is untrusted. */
export interface IncomingSuiteUnit {
  suiteNumber?: number | null
  rawPhrase?: string | null
  suiteTypeId?: string | null
  suiteTypeName?: string | null
  bedroomTypeId?: string | null
  bedroomLayoutId?: string | null
  bathroomTypeId?: string | null
  editedAxes?: SuiteAxis[] | null
  match?: unknown
}

export interface ResolvedSuiteUnit {
  suiteNumber: number
  rawPhrase: string
  suiteTypeId: string | null
  suiteTypeName: string | null
  bedroomTypeId: string | null
  bedroomLayoutId: string | null
  bathroomTypeId: string | null
  /** Axes the consultant edited — drives whether an alias is recorded or promoted. */
  editedAxes: SuiteAxis[]
  /** Axes whose value came from an unconfirmed alias and was left untouched. */
  aliasAcceptedAxes: SuiteAxis[]
  matchJson: Json
}

const AXIS_ID_FIELD = {
  suiteType: "suiteTypeId",
  bedroomType: "bedroomTypeId",
  bedroomLayout: "bedroomLayoutId",
  bathroomType: "bathroomTypeId",
} as const

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value ?? null)) as Json
}

/**
 * Server-side authority over the suite units on an enquiry. Client ids are never trusted: each is
 * checked against the supplier's real vocabulary and nulled if it doesn't belong, and any unit
 * that arrives unresolved but carries raw wording is re-resolved here. Invalid references are
 * dropped rather than rejected — losing an entire enquiry over one bad id is worse than losing
 * the id, which matches the lenient-uuid handling used elsewhere in this route.
 */
export async function resolveEnquirySuiteUnits(
  supabase: Client,
  supplierId: string | null,
  units: readonly IncomingSuiteUnit[],
): Promise<{ units: ResolvedSuiteUnit[]; vocabulary: SuiteVocabulary | null }> {
  if (units.length === 0) return { units: [], vocabulary: null }

  if (!supplierId) {
    // No supplier means no vocabulary to validate against — keep the wording, drop every id.
    return {
      units: units.map((unit, index) => ({
        suiteNumber: unit.suiteNumber ?? index + 1,
        rawPhrase: (unit.rawPhrase ?? "").trim(),
        suiteTypeId: null,
        suiteTypeName: unit.suiteTypeName?.trim() || null,
        bedroomTypeId: null,
        bedroomLayoutId: null,
        bathroomTypeId: null,
        editedAxes: [],
        aliasAcceptedAxes: [],
        matchJson: toJson(unit.match),
      })),
      vocabulary: null,
    }
  }

  const vocabulary = await loadSupplierSuiteVocabulary(supabase, supplierId)
  const suiteTypeById = new Map(vocabulary.suiteTypes.map((entry) => [entry.id, entry]))
  const allowedByShapeType = await loadAllowedSuiteVariantIds(
    supabase,
    vocabulary.suiteTypes.map((entry) => entry.id),
  )

  const resolved = units.map((unit, index) => {
    const rawPhrase = (unit.rawPhrase ?? "").trim()
    const editedAxes = unit.editedAxes ?? []
    const aliasAcceptedAxes: SuiteAxis[] = []

    // Start from the client's values, keeping only ids this supplier actually owns.
    let suiteTypeId = unit.suiteTypeId && suiteTypeById.has(unit.suiteTypeId) ? unit.suiteTypeId : null
    let bedroomTypeId = unit.bedroomTypeId ?? null
    let bedroomLayoutId = unit.bedroomLayoutId ?? null
    let bathroomTypeId = unit.bathroomTypeId ?? null
    let matchJson = toJson(unit.match)

    // Nothing usable arrived but we have wording: resolve it here, so a web-form or replayed
    // payload gets the same treatment as the review modal.
    if (!suiteTypeId && rawPhrase) {
      const resolution = resolveSuitePhrase(rawPhrase, vocabulary)
      suiteTypeId = resolution.suiteTypeId
      bedroomTypeId = resolution.bedroomTypeId
      bedroomLayoutId = resolution.bedroomLayoutId
      bathroomTypeId = resolution.bathroomTypeId
      matchJson = toJson({
        score: resolution.score,
        source: resolution.source,
        unresolvedAxes: resolution.unresolvedAxes,
        axes: resolution.axes,
      })

      for (const axis of ["suiteType", "bedroomType", "bedroomLayout", "bathroomType"] as SuiteAxis[]) {
        if (resolution.axes[axis].source === "alias" && !editedAxes.includes(axis)) {
          aliasAcceptedAxes.push(axis)
        }
      }
    } else if (suiteTypeId) {
      // The client resolved it (or a human picked it). Record which axes were accepted from an
      // unconfirmed alias rather than chosen, so those aliases can be promoted.
      const clientMatch = unit.match as Record<string, { source?: string }> | undefined
      for (const axis of ["suiteType", "bedroomType", "bedroomLayout", "bathroomType"] as SuiteAxis[]) {
        if (clientMatch?.[axis]?.source === "alias" && !editedAxes.includes(axis)) {
          aliasAcceptedAxes.push(axis)
        }
      }
    }

    // Config axes are only meaningful against a suite type, and only if that suite type offers
    // them. findInvalidVariantField is the same check the package-selections endpoint applies.
    if (!suiteTypeId) {
      bedroomTypeId = null
      bedroomLayoutId = null
      bathroomTypeId = null
    } else {
      let invalidField = findInvalidVariantField(
        { suiteTypeId, bedroomTypeId, bedroomLayoutId, bathroomTypeId },
        allowedByShapeType,
      )
      // Drop offending values one at a time rather than rejecting the request.
      while (invalidField) {
        if (invalidField === "bedroomTypeId") bedroomTypeId = null
        else if (invalidField === "bedroomLayoutId") bedroomLayoutId = null
        else bathroomTypeId = null

        invalidField = findInvalidVariantField(
          { suiteTypeId, bedroomTypeId, bedroomLayoutId, bathroomTypeId },
          allowedByShapeType,
        )
      }
    }

    return {
      suiteNumber: unit.suiteNumber ?? index + 1,
      rawPhrase,
      suiteTypeId,
      suiteTypeName: suiteTypeId ? suiteTypeById.get(suiteTypeId)?.name ?? null : null,
      bedroomTypeId,
      bedroomLayoutId,
      bathroomTypeId,
      editedAxes: editedAxes.filter((axis) => Boolean(unitAxisValue(axis, {
        suiteTypeId, bedroomTypeId, bedroomLayoutId, bathroomTypeId,
      }))),
      aliasAcceptedAxes,
      matchJson,
    }
  })

  return { units: resolved, vocabulary }
}

function unitAxisValue(
  axis: SuiteAxis,
  ids: Pick<ResolvedSuiteUnit, "suiteTypeId" | "bedroomTypeId" | "bedroomLayoutId" | "bathroomTypeId">,
): string | null {
  return ids[AXIS_ID_FIELD[axis]]
}

export { unitAxisValue }

/**
 * Converts legacy name-only input (the public web form's `suiteTypes`) into units. Names are
 * matched exactly against the supplier's vocabulary by the caller's resolver step; here they
 * simply become the raw wording so the same path handles both shapes.
 */
export function legacySuiteNamesToUnits(suiteTypeNames: readonly string[]): IncomingSuiteUnit[] {
  return suiteTypeNames
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name, index) => ({ suiteNumber: index + 1, rawPhrase: name, suiteTypeName: name }))
}

/** Exact-name lookup used when a legacy payload names a suite type verbatim. */
export function matchSuiteTypeByName(vocabulary: SuiteVocabulary, name: string): string | null {
  const normalized = normalizeLookupValue(name)
  return vocabulary.suiteTypes.find((entry) => normalizeLookupValue(entry.name) === normalized)?.id ?? null
}
