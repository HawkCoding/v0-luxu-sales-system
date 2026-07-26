/**
 * Normalizes free text for loose equality/substring lookups against reference data (supplier,
 * package, hotel, route, suite names, ...). Lowercases and collapses everything that isn't a
 * letter or digit into a single space. Intentionally simple/ASCII-oriented — for
 * diacritic-aware matching (e.g. country names) use `normalizeAliasKey` from `@/lib/countries`.
 */
export function normalizeLookupValue(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}
