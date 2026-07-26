import type {
  SuiteMatchCandidate,
  SuiteMatchSource,
  SuiteResolution,
} from "@/lib/suites/resolve-suite-phrase"
import type { SuiteAxis, SuiteVocabulary } from "@/lib/suites/suite-vocabulary"

export interface SuiteAxisProvenance {
  score: number
  source: SuiteMatchSource
  candidates: SuiteMatchCandidate[]
  notApplicable: boolean
}

/**
 * One requested room on an enquiry: the customer's raw wording, the ids it resolved to (null
 * wherever nothing was certain), and how each axis was resolved. `editedAxes` is set by the
 * review UI on save and is what distinguishes "the consultant corrected this" (record an alias)
 * from "the consultant accepted our suggestion" (promote the alias).
 */
export interface DraftSuiteUnit {
  suiteNumber: number
  rawPhrase: string
  suiteTypeId: string | null
  suiteTypeName: string | null
  bedroomTypeId: string | null
  bedroomLayoutId: string | null
  bathroomTypeId: string | null
  match: Record<SuiteAxis, SuiteAxisProvenance>
  editedAxes?: SuiteAxis[]
}

export const SUITE_AXES: readonly SuiteAxis[] = [
  "suiteType",
  "bedroomType",
  "bedroomLayout",
  "bathroomType",
]

function provenanceFor(resolution: SuiteResolution, axis: SuiteAxis): SuiteAxisProvenance {
  const match = resolution.axes[axis]
  return {
    score: match.score,
    source: match.source,
    candidates: match.candidates,
    notApplicable: match.notApplicable,
  }
}

export function draftSuiteUnitFromResolution(
  resolution: SuiteResolution,
  suiteNumber: number,
  vocabulary: SuiteVocabulary,
): DraftSuiteUnit {
  const suiteTypeName = resolution.suiteTypeId
    ? vocabulary.suiteTypes.find((entry) => entry.id === resolution.suiteTypeId)?.name ?? null
    : null

  return {
    suiteNumber,
    rawPhrase: resolution.rawPhrase,
    suiteTypeId: resolution.suiteTypeId,
    suiteTypeName,
    bedroomTypeId: resolution.bedroomTypeId,
    bedroomLayoutId: resolution.bedroomLayoutId,
    bathroomTypeId: resolution.bathroomTypeId,
    match: {
      suiteType: provenanceFor(resolution, "suiteType"),
      bedroomType: provenanceFor(resolution, "bedroomType"),
      bedroomLayout: provenanceFor(resolution, "bedroomLayout"),
      bathroomType: provenanceFor(resolution, "bathroomType"),
    },
  }
}

/** A unit with nothing resolved -- used to pad when the suite count exceeds the phrases found. */
export function blankDraftSuiteUnit(suiteNumber: number, rawPhrase = ""): DraftSuiteUnit {
  const empty: SuiteAxisProvenance = { score: 0, source: "none", candidates: [], notApplicable: false }
  return {
    suiteNumber,
    rawPhrase,
    suiteTypeId: null,
    suiteTypeName: null,
    bedroomTypeId: null,
    bedroomLayoutId: null,
    bathroomTypeId: null,
    match: {
      suiteType: { ...empty },
      bedroomType: { ...empty },
      bedroomLayout: { ...empty },
      bathroomType: { ...empty },
    },
  }
}
