import {
  isLessSpecificVariantOf,
  scoreCandidates,
  tokenizeMatchPhrase,
  type MatchCandidateEntry,
  type ScoredCandidate,
} from "@/lib/matching/score-candidates"

export type MatchSource = "exact" | "fuzzy" | "none"

export interface MatchCandidate {
  id: string
  name: string
  score: number
}

export interface MatchResult {
  value: string | null
  name: string | null
  score: number
  source: MatchSource
  /** Candidates scoring above the candidate threshold, best first -- for surfacing "did you mean" UI. */
  candidates: MatchCandidate[]
}

export interface ResolveEntityOptions {
  acceptThreshold?: number
  ambiguityMargin?: number
  candidateThreshold?: number
}

export const MATCH_ACCEPT_THRESHOLD = 0.82
export const MATCH_CANDIDATE_THRESHOLD = 0.45
/** Best must beat runner-up by at least this much, else nothing is filled. */
export const MATCH_AMBIGUITY_MARGIN = 0.12

function candidatesAbove(scored: readonly ScoredCandidate[], threshold: number): MatchCandidate[] {
  return scored
    .filter((candidate) => candidate.score >= threshold)
    .slice(0, 5)
    .map((candidate) => ({ id: candidate.id, name: candidate.name, score: candidate.score }))
}

/**
 * The shared never-guess resolution rule, generalized from lib/suites/resolve-suite-phrase.ts so
 * every free-text-to-vocabulary resolver (supplier, hotel, route, and suite) uses the same
 * discipline: fill a value only when the best candidate clears an absolute confidence floor AND
 * is not itself ambiguous against the runner-up. Anything else resolves to null, with candidates
 * attached so ambiguity is reportable rather than silently guessed away.
 */
export function pickMatch(
  scored: readonly ScoredCandidate[],
  options?: ResolveEntityOptions,
): MatchResult {
  const acceptThreshold = options?.acceptThreshold ?? MATCH_ACCEPT_THRESHOLD
  const ambiguityMargin = options?.ambiguityMargin ?? MATCH_AMBIGUITY_MARGIN
  const candidateThreshold = options?.candidateThreshold ?? MATCH_CANDIDATE_THRESHOLD

  const candidates = candidatesAbove(scored, candidateThreshold)
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

/**
 * Resolve free text against a candidate pool with the same accept-threshold + ambiguity-margin
 * discipline as the suite resolver. Returns null (never a guess) when nothing clears the bar or
 * the top two candidates are too close to call.
 */
export function resolveEntity(
  rawPhrase: string,
  candidates: readonly MatchCandidateEntry[],
  options?: ResolveEntityOptions,
): MatchResult {
  const phraseTokens = tokenizeMatchPhrase(rawPhrase)
  if (phraseTokens.length === 0 || candidates.length === 0) {
    return { value: null, name: null, score: 0, source: "none", candidates: [] }
  }

  const scored = scoreCandidates(phraseTokens, candidates)
  return pickMatch(scored, options)
}
