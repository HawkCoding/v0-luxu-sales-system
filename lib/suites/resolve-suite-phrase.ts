import { levenshteinDistance } from "@/lib/countries"
import {
  SUITE_GENERIC_TOKENS,
  normalizeSuitePhrase,
  tokenizeSuitePhrase,
  tokenWeight,
} from "@/lib/suites/suite-phrase-tokens"
import type { SuiteAxis, SuiteVocabEntry, SuiteVocabulary } from "@/lib/suites/suite-vocabulary"

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

interface ScoredCandidate {
  id: string
  name: string
  score: number
  source: "exact" | "fuzzy"
}

/** Coverage of a candidate's own tokens by the phrase's tokens -- not the reverse -- so a
 *  short candidate name ("Deluxe") isn't punished for the phrase containing other words. */
function scoreCandidates(phraseTokens: readonly string[], candidates: readonly SuiteVocabEntry[]): ScoredCandidate[] {
  const phraseSet = new Set(phraseTokens)
  // Adjacent-token joins catch wording that split a single vocab word across a space, which is
  // common in typed email ("De Luxe" for "Deluxe"). Levenshtein alone can't bridge these: it
  // only ever sees the fragment, so lev("deluxe", "luxe") falls under the similarity floor.
  const joinedPhraseTokens = new Set<string>()
  for (let index = 0; index < phraseTokens.length - 1; index += 1) {
    joinedPhraseTokens.add(`${phraseTokens[index]}${phraseTokens[index + 1]}`)
  }

  const scored = candidates.map((candidate): ScoredCandidate => {
    const candidateTokens = tokenizeSuitePhrase(candidate.name)
    if (candidateTokens.length === 0 || phraseTokens.length === 0) {
      return { id: candidate.id, name: candidate.name, score: 0, source: "exact" }
    }

    let totalWeight = 0
    let matchedWeight = 0
    let usedFuzzy = false

    for (const token of candidateTokens) {
      const weight = tokenWeight(token)
      totalWeight += weight

      if (phraseSet.has(token)) {
        matchedWeight += weight
        continue
      }

      if (joinedPhraseTokens.has(token)) {
        matchedWeight += weight * SUITE_JOINED_TOKEN_SIMILARITY
        usedFuzzy = true
        continue
      }

      if (token.length < SUITE_FUZZY_MIN_TOKEN_LENGTH) continue

      let bestSimilarity = 0
      for (const phraseToken of phraseTokens) {
        if (phraseToken.length < SUITE_FUZZY_MIN_TOKEN_LENGTH) continue
        const maxLen = Math.max(token.length, phraseToken.length)
        const similarity = 1 - levenshteinDistance(token, phraseToken) / maxLen
        if (similarity > bestSimilarity) bestSimilarity = similarity
      }

      if (bestSimilarity >= SUITE_FUZZY_MIN_TOKEN_SIMILARITY) {
        matchedWeight += weight * bestSimilarity
        usedFuzzy = true
      }
    }

    const score = totalWeight > 0 ? matchedWeight / totalWeight : 0
    return { id: candidate.id, name: candidate.name, score, source: usedFuzzy ? "fuzzy" : "exact" }
  })

  return scored.sort((a, b) => {
    if (Math.abs(a.score - b.score) > 1e-9) return b.score - a.score
    // Tie-break toward the longer/more specific candidate name.
    return b.name.length - a.name.length
  })
}

function candidatesAbove(scored: readonly ScoredCandidate[], threshold: number): SuiteMatchCandidate[] {
  return scored
    .filter((candidate) => candidate.score >= threshold)
    .slice(0, 5)
    .map((candidate) => ({ id: candidate.id, name: candidate.name, score: candidate.score }))
}

/**
 * True when the runner-up's tokens are a strict subset of the best's -- e.g. "Shower" against
 * "Shower and Bath" for the phrase "shower and bath". Both score full coverage, but they are not
 * competing interpretations: the runner-up is a less specific version of the same answer, so the
 * ambiguity guard must not treat the zero margin as a genuine tie.
 */
function isLessSpecificVariantOf(runnerUp: ScoredCandidate, best: ScoredCandidate): boolean {
  const bestTokens = new Set(tokenizeSuitePhrase(best.name))
  const runnerUpTokens = tokenizeSuitePhrase(runnerUp.name)
  if (runnerUpTokens.length === 0 || runnerUpTokens.length >= bestTokens.size) return false
  return runnerUpTokens.every((token) => bestTokens.has(token))
}

function pickAxisMatch(
  scored: readonly ScoredCandidate[],
  acceptThreshold: number,
  ambiguityMargin: number,
): Omit<SuiteAxisMatch, "notApplicable"> {
  const candidates = candidatesAbove(scored, SUITE_MATCH_CANDIDATE_THRESHOLD)
  const best = scored[0]
  const runnerUp = scored[1]

  const unambiguous =
    !runnerUp ||
    best.score - runnerUp.score >= ambiguityMargin ||
    isLessSpecificVariantOf(runnerUp, best)

  if (best && best.score >= acceptThreshold && unambiguous) {
    return { value: best.id, name: best.name, score: best.score, source: best.source, candidates }
  }

  return { value: null, name: null, score: 0, source: "none", candidates }
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
