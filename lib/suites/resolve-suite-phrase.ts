import {
  SUITE_GENERIC_TOKENS,
  normalizeSuitePhrase,
  tokenizeSuitePhrase,
} from "@/lib/suites/suite-phrase-tokens"
import type { SuiteAxis, SuiteVocabEntry, SuiteVocabulary } from "@/lib/suites/suite-vocabulary"
import { scoreCandidates, type ScoredCandidate } from "@/lib/matching/score-candidates"
import { pickMatch } from "@/lib/matching/resolve-entity"

export type SuiteMatchSource = "alias" | "exact" | "fuzzy" | "none"

export interface SuiteMatchCandidate {
  id: string
  name: string
  score: number
}

export interface SuiteAxisMatch {
  value: string | null
  name: string | null
  score: number
  source: SuiteMatchSource
  /** Top 5 candidates scoring above SUITE_MATCH_CANDIDATE_THRESHOLD, best first. Drives the UI dropdown. */
  candidates: SuiteMatchCandidate[]
  /** True when this axis has no vocab for the chosen suite type: resolving to null is
   *  correct here, not a gap -- never flag these as unresolved. */
  notApplicable: boolean
}

export interface SuiteResolution {
  rawPhrase: string
  normalizedPhrase: string
  suiteTypeId: string | null
  bedroomTypeId: string | null
  bedroomLayoutId: string | null
  bathroomTypeId: string | null
  /** The suite-type axis's score -- the gating one. */
  score: number
  /** Strongest provenance across the filled axes (mirrors the suite-type axis). */
  source: SuiteMatchSource
  axes: Record<SuiteAxis, SuiteAxisMatch>
  /** Axes with vocab that nothing matched. Excludes axes that are notApplicable. */
  unresolvedAxes: SuiteAxis[]
  /** Phrase tokens no axis consumed (excluding filler/generic) -- a hint for what was ignored. */
  unusedTokens: string[]
}

export const SUITE_MATCH_ACCEPT_THRESHOLD = 0.82
export const SUITE_MATCH_CANDIDATE_THRESHOLD = 0.45
/** Best must beat runner-up by at least this much, else nothing is filled. */
export const SUITE_MATCH_AMBIGUITY_MARGIN = 0.12
/** Levenshtein fuzzy matching only applies to tokens at least this long. */
export const SUITE_FUZZY_MIN_TOKEN_LENGTH = 4
export const SUITE_FUZZY_MIN_TOKEN_SIMILARITY = 0.75
/**
 * Credit for a candidate token matched by joining adjacent phrase tokens ("De Luxe" -> "Deluxe").
 * Just under 1 so the resolution is still reported as fuzzy rather than exact -- it is a real
 * match, but not a literal one.
 */
export const SUITE_JOINED_TOKEN_SIMILARITY = 0.95

/**
 * Thin wrapper over the shared lib/matching resolver: same scoring, same accept-threshold +
 * ambiguity-margin gate, same candidate reporting. Kept as a suite-shaped function (returns
 * SuiteMatchSource, not the plain matching module's MatchSource) so callers below don't need to
 * know the generalization happened underneath them.
 */
function pickAxisMatch(
  scored: readonly ScoredCandidate[],
  acceptThreshold: number,
  ambiguityMargin: number,
): Omit<SuiteAxisMatch, "notApplicable"> {
  const result = pickMatch(scored, {
    acceptThreshold,
    ambiguityMargin,
    candidateThreshold: SUITE_MATCH_CANDIDATE_THRESHOLD,
  })
  return result
}

function aliasFor(vocabulary: SuiteVocabulary, axis: SuiteAxis, normalizedPhrase: string) {
  return vocabulary.aliases.find((alias) => alias.axis === axis && alias.phrase === normalizedPhrase)
}

function emptyAxisMatch(notApplicable = false): SuiteAxisMatch {
  return { value: null, name: null, score: 0, source: "none", candidates: [], notApplicable }
}

function emptyResolution(rawPhrase: string, normalizedPhrase: string): SuiteResolution {
  return {
    rawPhrase,
    normalizedPhrase,
    suiteTypeId: null,
    bedroomTypeId: null,
    bedroomLayoutId: null,
    bathroomTypeId: null,
    score: 0,
    source: "none",
    axes: {
      suiteType: emptyAxisMatch(),
      bedroomType: emptyAxisMatch(),
      bedroomLayout: emptyAxisMatch(),
      bathroomType: emptyAxisMatch(),
    },
    unresolvedAxes: [],
    unusedTokens: [],
  }
}

/**
 * An all-null resolution for a phrase that could not be resolved at all -- used when there is no
 * supplier vocabulary to match against, so the customer's wording is still preserved verbatim.
 */
export function unresolvedSuitePhrase(rawPhrase: string): SuiteResolution {
  return emptyResolution(rawPhrase, normalizeSuitePhrase(rawPhrase))
}

export interface ResolveSuitePhraseOptions {
  acceptThreshold?: number
  ambiguityMargin?: number
}

export function resolveSuitePhrase(
  rawPhrase: string,
  vocabulary: SuiteVocabulary,
  options?: ResolveSuitePhraseOptions,
): SuiteResolution {
  const acceptThreshold = options?.acceptThreshold ?? SUITE_MATCH_ACCEPT_THRESHOLD
  const ambiguityMargin = options?.ambiguityMargin ?? SUITE_MATCH_AMBIGUITY_MARGIN
  const normalizedPhrase = normalizeSuitePhrase(rawPhrase)
  const phraseTokens = tokenizeSuitePhrase(rawPhrase)

  if (!normalizedPhrase || phraseTokens.length === 0) {
    return emptyResolution(rawPhrase, normalizedPhrase)
  }

  // Suite type axis -- never gated (it's what everything else gates on).
  const suiteTypeAlias = aliasFor(vocabulary, "suiteType", normalizedPhrase)
  const suiteTypeAxis: SuiteAxisMatch = suiteTypeAlias
    ? {
        value: suiteTypeAlias.targetId,
        name: vocabulary.suiteTypes.find((s) => s.id === suiteTypeAlias.targetId)?.name ?? null,
        score: 1,
        source: "alias",
        candidates: [],
        notApplicable: false,
      }
    : { ...pickAxisMatch(scoreCandidates(phraseTokens, vocabulary.suiteTypes), acceptThreshold, ambiguityMargin), notApplicable: false }

  const suiteTypeId = suiteTypeAxis.value
  const selectedSuiteType = suiteTypeId ? vocabulary.suiteTypes.find((s) => s.id === suiteTypeId) : undefined

  function resolveConfigAxis(
    axis: SuiteAxis,
    allowedIds: ReadonlySet<string> | undefined,
    pool: readonly SuiteVocabEntry[],
  ): SuiteAxisMatch {
    // No suite type resolved yet -> nothing to validate a config value against (decision 2 /
    // algorithm step 5). findInvalidVariantField would reject any value here anyway.
    if (!suiteTypeId) return emptyAxisMatch(false)

    const alias = aliasFor(vocabulary, axis, normalizedPhrase)
    if (alias) {
      return {
        value: alias.targetId,
        name: pool.find((entry) => entry.id === alias.targetId)?.name ?? null,
        score: 1,
        source: "alias",
        candidates: [],
        notApplicable: false,
      }
    }

    if (!allowedIds || allowedIds.size === 0) {
      // The suite type offers no vocab for this axis at all -- null is correct, not a gap.
      return emptyAxisMatch(true)
    }

    const restrictedPool = pool.filter((entry) => allowedIds.has(entry.id))
    const match = pickAxisMatch(scoreCandidates(phraseTokens, restrictedPool), acceptThreshold, ambiguityMargin)
    return { ...match, notApplicable: false }
  }

  const bedroomTypeAxis = resolveConfigAxis("bedroomType", selectedSuiteType?.bedroomTypeIds, vocabulary.bedroomTypes)
  const bedroomLayoutAxis = resolveConfigAxis(
    "bedroomLayout",
    selectedSuiteType?.bedroomLayoutIds,
    vocabulary.bedroomLayouts,
  )
  const bathroomTypeAxis = resolveConfigAxis(
    "bathroomType",
    selectedSuiteType?.bathroomTypeIds,
    vocabulary.bathroomTypes,
  )

  const axes: Record<SuiteAxis, SuiteAxisMatch> = {
    suiteType: suiteTypeAxis,
    bedroomType: bedroomTypeAxis,
    bedroomLayout: bedroomLayoutAxis,
    bathroomType: bathroomTypeAxis,
  }

  const unresolvedAxes = (Object.keys(axes) as SuiteAxis[]).filter(
    (axis) => axes[axis].value === null && !axes[axis].notApplicable,
  )

  const consumedTokens = new Set<string>()
  for (const axis of Object.values(axes)) {
    if (!axis.name) continue
    for (const token of tokenizeSuitePhrase(axis.name)) consumedTokens.add(token)
  }
  const unusedTokens = phraseTokens.filter(
    (token) => !consumedTokens.has(token) && !SUITE_GENERIC_TOKENS.has(token),
  )

  return {
    rawPhrase,
    normalizedPhrase,
    suiteTypeId: suiteTypeAxis.value,
    bedroomTypeId: bedroomTypeAxis.value,
    bedroomLayoutId: bedroomLayoutAxis.value,
    bathroomTypeId: bathroomTypeAxis.value,
    score: suiteTypeAxis.score,
    source: suiteTypeAxis.source,
    axes,
    unresolvedAxes,
    unusedTokens,
  }
}

export function resolveSuitePhrases(
  rawPhrases: readonly string[],
  vocabulary: SuiteVocabulary,
  options?: ResolveSuitePhraseOptions,
): SuiteResolution[] {
  return rawPhrases.map((phrase) => resolveSuitePhrase(phrase, vocabulary, options))
}
