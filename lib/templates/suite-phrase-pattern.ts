// Parser/renderer for the per-supplier suite phrase pattern (suppliers.suite_phrase_pattern).
//
// A pattern is a short template deciding how the full suite configuration reads for one
// supplier, e.g. Rovos Rail's "[{bedroom}] [{layout}] {type}" -> "Double Crosswise Deluxe
// Suite" versus the default grammar's "Double bedded Deluxe Suite with a shower, Crosswise".
// Kept separate from lib/templates/suite-description.ts so the token grammar (parsing,
// validation) stays pure and independently testable from the domain wiring that calls it.

export type SuitePatternToken = "type" | "bedroom" | "layout" | "bathroom"

/** The only tokens a pattern may reference. Shared by validation and the editor's hint text. */
export const SUITE_PATTERN_TOKENS: readonly SuitePatternToken[] = [
  "type",
  "bedroom",
  "layout",
  "bathroom",
]

const TOKEN_PATTERN = /\{([a-zA-Z]+)\}/g

/** Chunk = a literal run, or a `[...]` optional group whose whole text drops when any token
 * inside it is empty. A lone unmatched `[` or `]` is kept as a literal character rather than
 * erroring, so a pattern typo degrades to odd punctuation instead of a broken save. */
const CHUNK_PATTERN = /\[[^[\]]*\]|[^[\]]+|[[\]]/g

/** Every `{word}` in the pattern that isn't one of SUITE_PATTERN_TOKENS, deduped in order of
 * first appearance. Empty when the pattern is blank or every token is known -- callers reject
 * the save when this is non-empty so an unknown token (a typo, e.g. `{bedrom}`) can never reach
 * a client document. */
export function findUnknownSuitePatternTokens(pattern: string | null | undefined): string[] {
  if (!pattern) return []
  const unknown: string[] = []
  const seen = new Set<string>()
  for (const match of pattern.matchAll(TOKEN_PATTERN)) {
    const name = match[1]
    if ((SUITE_PATTERN_TOKENS as readonly string[]).includes(name)) continue
    if (seen.has(name)) continue
    seen.add(name)
    unknown.push(name)
  }
  return unknown
}

function substitute(text: string, values: Record<SuitePatternToken, string>): string {
  return text.replace(TOKEN_PATTERN, (whole, name: string) =>
    (SUITE_PATTERN_TOKENS as readonly string[]).includes(name)
      ? values[name as SuitePatternToken]
      : whole,
  )
}

function groupHasEmptyToken(inner: string, values: Record<SuitePatternToken, string>): boolean {
  for (const match of inner.matchAll(TOKEN_PATTERN)) {
    const name = match[1] as SuitePatternToken
    if ((SUITE_PATTERN_TOKENS as readonly string[]).includes(name) && !values[name]) return true
  }
  return false
}

/**
 * Renders one supplier's pattern against a suite selection's values. `{type}` is mandatory --
 * an empty `values.type` yields "" regardless of the pattern, mirroring the empty-name guard in
 * formatSuitePhrase (a suite with no type name never composes a phrase). Every other token is
 * optional: a `[...]` group referencing an empty token is dropped in full, so surrounding
 * literal words (e.g. "with a ") never dangle; a bare token outside any group is substituted
 * with the empty string. Whitespace left behind by dropped groups is collapsed and the result
 * trimmed.
 */
export function renderSuitePhrasePattern(
  pattern: string,
  values: Record<SuitePatternToken, string>,
): string {
  if (!values.type.trim()) return ""

  const parts: string[] = []
  for (const chunk of pattern.match(CHUNK_PATTERN) ?? []) {
    if (chunk.startsWith("[") && chunk.endsWith("]")) {
      const inner = chunk.slice(1, -1)
      if (!groupHasEmptyToken(inner, values)) parts.push(substitute(inner, values))
      continue
    }
    parts.push(substitute(chunk, values))
  }

  return parts.join("").replace(/\s+/g, " ").trim()
}
