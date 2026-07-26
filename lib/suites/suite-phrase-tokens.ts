import { normalizeAliasKey } from "@/lib/countries"

/**
 * Tokens that carry no discriminating signal in suite/room wording and are dropped entirely
 * before scoring -- from both the inbound phrase and the candidate vocabulary names.
 */
export const SUITE_FILLER_TOKENS: ReadonlySet<string> = new Set([
  "a", "an", "the", "with", "and", "or", "of", "in", "for", "plus", "no", "nr", "type",
  "en", "please", "one", "two", "three", "four", "both", "per", "each", "my", "we", "us",
  "our", "will", "be", "is", "are", "to", "at",
])

/**
 * Tokens that are real words but are present in almost every candidate name ("suite", "room"),
 * so on their own they carry little discriminating power. Weighted down rather than dropped --
 * dropping them entirely would make e.g. Rovos's "Pullman Suite" and "Deluxe Suite" score
 * identically against a bare "suite", while treating them at full weight would let a bare
 * "suite" score 0.5 against "Deluxe Suite".
 */
export const SUITE_GENERIC_TOKENS: ReadonlySet<string> = new Set([
  "suite", "suites", "room", "rooms", "cabin", "cabins", "compartment", "compartments",
  "bed", "beds", "bedroom", "bathroom", "bath",
])

export const SUITE_GENERIC_TOKEN_WEIGHT = 0.2

/** Normalizes free suite/room wording for tokenizing and for alias-phrase equality checks. */
export function normalizeSuitePhrase(raw: string): string {
  return normalizeAliasKey(raw)
}

/** Splits a normalized (or raw) phrase into filler-stripped tokens. */
export function tokenizeSuitePhrase(raw: string): string[] {
  const normalized = normalizeSuitePhrase(raw)
  if (!normalized) return []

  return normalized
    .split(" ")
    .filter((token) => token.length > 0 && !SUITE_FILLER_TOKENS.has(token))
}

/** Scoring weight for a single token: generic words count for less than distinguishing ones. */
export function tokenWeight(token: string): number {
  return SUITE_GENERIC_TOKENS.has(token) ? SUITE_GENERIC_TOKEN_WEIGHT : 1
}
