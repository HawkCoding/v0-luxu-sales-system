import { type ParsedDraft } from "@/lib/import/parseEmailDraft"
import {
  blankDraftSuiteUnit,
  draftSuiteUnitFromResolution,
  type DraftSuiteUnit,
} from "@/lib/suites/draft-suite-unit"
import { resolveSuitePhrases } from "@/lib/suites/resolve-suite-phrase"
import type { SuiteAxis, SuiteVocabulary } from "@/lib/suites/suite-vocabulary"

/** The units currently on the draft, or blank units derived from its raw phrases. */
export function getDraftSuiteUnits(draft: ParsedDraft): DraftSuiteUnit[] {
  if (draft.guests.suiteUnits && draft.guests.suiteUnits.length > 0) {
    return draft.guests.suiteUnits
  }

  return draft.guests.suitePhrases.map((phrase, index) => blankDraftSuiteUnit(index + 1, phrase))
}

/**
 * Grows/shrinks the unit list to match the suite count, padding with blank units. Padding carries
 * no raw phrase, so a consultant adding a fourth suite to a three-suite enquiry gets an
 * explicitly empty row rather than a duplicated guess.
 */
export function resizeSuiteUnits(existing: DraftSuiteUnit[], suiteCount: number): DraftSuiteUnit[] {
  const normalizedCount = Math.max(0, Math.floor(suiteCount))
  return Array.from({ length: normalizedCount }, (_, index) => {
    const unit = existing[index]
    return unit ? { ...unit, suiteNumber: index + 1 } : blankDraftSuiteUnit(index + 1)
  })
}

export function normalizeDraftSuiteUnits(draft: ParsedDraft): ParsedDraft {
  const suiteUnits = resizeSuiteUnits(getDraftSuiteUnits(draft), draft.guests.suites)

  return {
    ...draft,
    guests: {
      ...draft.guests,
      suiteType: suiteUnits[0]?.rawPhrase ?? "",
      suiteUnits,
    },
  }
}

export function updateDraftSuiteCount(draft: ParsedDraft, suiteCount: number): ParsedDraft {
  const suiteUnits = resizeSuiteUnits(getDraftSuiteUnits(draft), suiteCount)

  return {
    ...draft,
    guests: {
      ...draft.guests,
      suites: suiteCount,
      suiteType: suiteUnits[0]?.rawPhrase ?? "",
      suiteUnits,
    },
  }
}

const AXIS_ID_FIELD: Record<SuiteAxis, keyof Pick<
  DraftSuiteUnit,
  "suiteTypeId" | "bedroomTypeId" | "bedroomLayoutId" | "bathroomTypeId"
>> = {
  suiteType: "suiteTypeId",
  bedroomType: "bedroomTypeId",
  bedroomLayout: "bedroomLayoutId",
  bathroomType: "bathroomTypeId",
}

/**
 * Sets one axis on one unit and marks that axis as human-edited. The edited flag is what the
 * alias learning reads: an edited axis records a correction, an unedited one that came from a
 * provisional alias gets promoted instead.
 */
export function updateDraftSuiteAxisAtIndex(
  draft: ParsedDraft,
  suiteIndex: number,
  axis: SuiteAxis,
  id: string | null,
  name?: string | null,
): ParsedDraft {
  const suiteUnits = resizeSuiteUnits(getDraftSuiteUnits(draft), draft.guests.suites)
  const unit = suiteUnits[suiteIndex]
  if (!unit) return draft

  const editedAxes = new Set(unit.editedAxes ?? [])
  editedAxes.add(axis)

  const updated: DraftSuiteUnit = {
    ...unit,
    [AXIS_ID_FIELD[axis]]: id,
    editedAxes: Array.from(editedAxes),
  }

  // Changing the suite type invalidates every config axis: the new suite type may not offer the
  // values the old one did (mirrors SuiteLegEditor's reset behaviour).
  if (axis === "suiteType") {
    updated.suiteTypeName = name ?? null
    updated.bedroomTypeId = null
    updated.bedroomLayoutId = null
    updated.bathroomTypeId = null
  }

  suiteUnits[suiteIndex] = updated

  return { ...draft, guests: { ...draft.guests, suiteUnits } }
}

/**
 * Runs the resolver over the draft's raw phrases and attaches the resulting units. Any axis a
 * consultant has already edited is preserved -- re-resolving must never overwrite a human choice.
 */
export function applySuiteResolutions(draft: ParsedDraft, vocabulary: SuiteVocabulary): ParsedDraft {
  const existingUnits = draft.guests.suiteUnits ?? []
  const resolutions = resolveSuitePhrases(draft.guests.suitePhrases, vocabulary)

  const resolvedUnits = resolutions.map((resolution, index) => {
    const resolved = draftSuiteUnitFromResolution(resolution, index + 1, vocabulary)
    const existing = existingUnits[index]
    if (!existing?.editedAxes?.length) return resolved

    const preserved: DraftSuiteUnit = { ...resolved, editedAxes: existing.editedAxes }
    for (const axis of existing.editedAxes) {
      preserved[AXIS_ID_FIELD[axis]] = existing[AXIS_ID_FIELD[axis]]
      if (axis === "suiteType") preserved.suiteTypeName = existing.suiteTypeName
    }
    return preserved
  })

  const suiteUnits = resizeSuiteUnits(resolvedUnits, draft.guests.suites || resolvedUnits.length)

  return {
    ...draft,
    guests: {
      ...draft.guests,
      suiteUnits,
    },
  }
}
