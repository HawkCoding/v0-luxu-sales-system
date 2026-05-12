import { type ParsedDraft } from "@/lib/import/parseEmailDraft"

export interface DraftSuiteSelection {
  suiteTypeId: string
  suiteTypeName: string
}

export function getDraftSuiteTypeNames(draft: ParsedDraft): string[] {
  const selectedNames = draft.guests.suiteSelections
    ?.map((selection) => selection.suiteTypeName.trim())
    .filter(Boolean)

  if (selectedNames && selectedNames.length > 0) {
    return selectedNames
  }

  const suiteTypes = draft.guests.suiteTypes
    ?.map((suiteType) => suiteType.trim())
    .filter(Boolean)

  if (suiteTypes && suiteTypes.length > 0) {
    return suiteTypes
  }

  return draft.guests.suiteType ? [draft.guests.suiteType] : []
}

export function resizeSuiteTypeNames(existing: string[], suiteCount: number): string[] {
  const normalizedCount = Math.max(0, Math.floor(suiteCount))
  return Array.from({ length: normalizedCount }, (_, index) => existing[index] ?? "")
}

export function normalizeDraftSuiteTypes(draft: ParsedDraft): ParsedDraft {
  const suiteTypes = resizeSuiteTypeNames(getDraftSuiteTypeNames(draft), draft.guests.suites)

  return {
    ...draft,
    guests: {
      ...draft.guests,
      suiteType: suiteTypes[0] ?? "",
      suiteTypes,
      suiteSelections: undefined,
    },
  }
}

export function updateDraftSuiteCount(draft: ParsedDraft, suiteCount: number): ParsedDraft {
  const suiteTypes = resizeSuiteTypeNames(getDraftSuiteTypeNames(draft), suiteCount)

  return {
    ...draft,
    guests: {
      ...draft.guests,
      suites: suiteCount,
      suiteType: suiteTypes[0] ?? "",
      suiteTypes,
      suiteSelections: undefined,
    },
  }
}

export function updateDraftSuiteTypeAtIndex(
  draft: ParsedDraft,
  suiteIndex: number,
  suiteTypeName: string,
): ParsedDraft {
  const suiteTypes = resizeSuiteTypeNames(getDraftSuiteTypeNames(draft), draft.guests.suites)
  suiteTypes[suiteIndex] = suiteTypeName

  return {
    ...draft,
    guests: {
      ...draft.guests,
      suiteType: suiteTypes[0] ?? "",
      suiteTypes,
      suiteSelections: undefined,
    },
  }
}

export function applySuiteSelections(
  draft: ParsedDraft,
  suiteSelections: DraftSuiteSelection[],
): ParsedDraft {
  const suiteTypes = resizeSuiteTypeNames(
    suiteSelections.map((selection) => selection.suiteTypeName),
    draft.guests.suites,
  )

  return {
    ...draft,
    guests: {
      ...draft.guests,
      suiteType: suiteTypes[0] ?? "",
      suiteTypes,
      suiteSelections,
    },
  }
}
