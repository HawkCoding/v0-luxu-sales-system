import { levenshteinDistance } from "@/lib/countries"
// Reuse the suite module's tokenizer/weighting: the tokens it produces (lowercase, diacritic-
// stripped, filler-stripped) are generic, not suite-specific. The one suite-flavoured behaviour --
// weighting "suite"/"room"/"cabin" etc. down rather than dropping them -- is harmless for other
// entity kinds (supplier/route names essentially never contain those words), so there is no need
// for a second tokenizer just to lose that name.
import { tokenizeSuitePhrase, tokenWeight } from "@/lib/suites/suite-phrase-tokens"

/** The minimal shape every candidate pool must provide: an id to resolve to, a name to score against. */
export interface MatchCandidateEntry {
  id: string
  name: string
}

export type MatchProvenance = "exact" | "fuzzy"

export interface ScoredCandidate {
  id: string
  name: string
  score: number
  source: MatchProvenance
}

/** Levenshtein fuzzy matching only applies to tokens at least this long. */
export const MATCH_FUZZY_MIN_TOKEN_LENGTH = 4
export const MATCH_FUZZY_MIN_TOKEN_SIMILARITY = 0.75
/**
 * Credit for a candidate token matched by joining adjacent phrase tokens ("De Luxe" -> "Deluxe").
 * Just under 1 so the resolution is still reported as fuzzy rather than exact -- it is a real
 * match, but not a literal one.
 */
export const MATCH_JOINED_TOKEN_SIMILARITY = 0.95

/**
 * Coverage of a candidate's own tokens by the phrase's tokens -- not the reverse -- so a short
 * candidate name ("Rovos Rail") isn't punished for the phrase containing other words. Shared by
 * every free-text-to-vocabulary resolver in the app (suites, and now suppliers/hotels/routes) so
 * they all carry the same never-guess scoring discipline instead of a first-match substring check.
 */
export function scoreCandidates(
  phraseTokens: readonly string[],
  candidates: readonly MatchCandidateEntry[],
): ScoredCandidate[] {
  const phraseSet = new Set(phraseTokens)
  // Adjacent-token joins catch wording that split a single vocab word across a space, which is
  // common in typed email ("De Luxe" for "Deluxe"). Levenshtein alone can't bridge these: it only
  // ever sees the fragment, so lev("deluxe", "luxe") falls under the similarity floor.
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
        matchedWeight += weight * MATCH_JOINED_TOKEN_SIMILARITY
        usedFuzzy = true
        continue
      }

      if (token.length < MATCH_FUZZY_MIN_TOKEN_LENGTH) continue

      let bestSimilarity = 0
      for (const phraseToken of phraseTokens) {
        if (phraseToken.length < MATCH_FUZZY_MIN_TOKEN_LENGTH) continue
        const maxLen = Math.max(token.length, phraseToken.length)
        const similarity = 1 - levenshteinDistance(token, phraseToken) / maxLen
        if (similarity > bestSimilarity) bestSimilarity = similarity
      }

      if (bestSimilarity >= MATCH_FUZZY_MIN_TOKEN_SIMILARITY) {
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

/**
 * True when the runner-up's tokens are a strict subset of the best's -- e.g. "Shower" against
 * "Shower and Bath" for the phrase "shower and bath". Both score full coverage, but they are not
 * competing interpretations: the runner-up is a less specific version of the same answer, so the
 * ambiguity guard must not treat the zero margin as a genuine tie.
 */
export function isLessSpecificVariantOf(runnerUp: ScoredCandidate, best: ScoredCandidate): boolean {
  const bestTokens = new Set(tokenizeSuitePhrase(best.name))
  const runnerUpTokens = tokenizeSuitePhrase(runnerUp.name)
  if (runnerUpTokens.length === 0 || runnerUpTokens.length >= bestTokens.size) return false
  return runnerUpTokens.every((token) => bestTokens.has(token))
}

export function tokenizeMatchPhrase(raw: string): string[] {
  return tokenizeSuitePhrase(raw)
}
