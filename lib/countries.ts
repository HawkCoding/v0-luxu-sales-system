import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

const COUNTRY_ALIAS_CACHE_TTL_MS = 5 * 60 * 1000

type CountryAliasRecord = Database["public"]["Tables"]["country_aliases"]["Row"]
export type CountryAliasMap = Map<string, string>

let cachedCountryAliasMap: CountryAliasMap | null = null
let countryAliasCacheExpiresAt = 0

function normalizeAliasKey(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
}

function addAlias(map: CountryAliasMap, alias: string, countryName: string) {
  const normalizedAlias = normalizeAliasKey(alias)
  if (!normalizedAlias) return

  if (!map.has(normalizedAlias)) map.set(normalizedAlias, countryName)

  const noSpaceAlias = normalizedAlias.replace(/\s+/g, "")
  if (noSpaceAlias.length > 1 && !map.has(noSpaceAlias)) map.set(noSpaceAlias, countryName)
}

function buildLookupCandidates(value: string): string[] {
  const normalized = normalizeAliasKey(value)
  if (!normalized) return []

  const candidates = new Set<string>([normalized, normalized.replace(/\s+/g, "")])
  if (normalized.startsWith("the ")) {
    candidates.add(normalized.slice(4))
  }
  if (normalized.startsWith("republic of ")) {
    candidates.add(normalized.slice("republic of ".length))
  }

  return Array.from(candidates).filter(Boolean)
}

function buildComparableAliasList(aliasMap: CountryAliasMap): string[] {
  const seen = new Set<string>()
  const aliases: string[] = []

  for (const alias of aliasMap.keys()) {
    if (seen.has(alias)) continue
    seen.add(alias)
    aliases.push(alias)
  }

  return aliases
}

export function levenshteinDistance(source: string, target: string): number {
  if (source === target) return 0
  if (source.length === 0) return target.length
  if (target.length === 0) return source.length

  const previousRow = Array.from({ length: target.length + 1 }, (_, index) => index)
  const currentRow = new Array<number>(target.length + 1)

  for (let sourceIndex = 1; sourceIndex <= source.length; sourceIndex += 1) {
    currentRow[0] = sourceIndex

    for (let targetIndex = 1; targetIndex <= target.length; targetIndex += 1) {
      const substitutionCost = source[sourceIndex - 1] === target[targetIndex - 1] ? 0 : 1
      currentRow[targetIndex] = Math.min(
        previousRow[targetIndex] + 1,
        currentRow[targetIndex - 1] + 1,
        previousRow[targetIndex - 1] + substitutionCost,
      )
    }

    for (let targetIndex = 0; targetIndex <= target.length; targetIndex += 1) {
      previousRow[targetIndex] = currentRow[targetIndex]
    }
  }

  return previousRow[target.length]
}

export async function loadCountryAliasMap(
  supabase: SupabaseClient<Database>,
): Promise<CountryAliasMap> {
  const now = Date.now()
  if (cachedCountryAliasMap && countryAliasCacheExpiresAt > now) return cachedCountryAliasMap

  const [{ data: countries, error: countriesError }, { data: aliases, error: aliasesError }] =
    await Promise.all([
      supabase.from("countries").select("id, name, iso_alpha2, iso_alpha3"),
      supabase.from("country_aliases").select("country_id, alias"),
    ])

  if (countriesError) throw new Error("Failed to load countries")
  if (aliasesError) throw new Error("Failed to load country aliases")

  const countriesById = new Map<
    string,
    { id: string; name: string; iso_alpha2: string | null; iso_alpha3: string | null }
  >()
  for (const country of countries ?? []) {
    countriesById.set(country.id, country)
  }

  const aliasMap: CountryAliasMap = new Map()
  for (const country of countries ?? []) {
    addAlias(aliasMap, country.name, country.name)
    if (country.iso_alpha2) addAlias(aliasMap, country.iso_alpha2, country.name)
    if (country.iso_alpha3) addAlias(aliasMap, country.iso_alpha3, country.name)
  }

  for (const alias of (aliases ?? []) as CountryAliasRecord[]) {
    const canonicalCountry = countriesById.get(alias.country_id)
    if (!canonicalCountry) continue
    addAlias(aliasMap, alias.alias, canonicalCountry.name)
  }

  cachedCountryAliasMap = aliasMap
  countryAliasCacheExpiresAt = now + COUNTRY_ALIAS_CACHE_TTL_MS
  return aliasMap
}

export function normalizeCountry(
  value: string | null | undefined,
  aliasMap: CountryAliasMap,
): string | null {
  if (typeof value !== "string") return null
  const compact = value.trim()
  if (!compact) return null

  const candidates = buildLookupCandidates(compact)
  for (const candidate of candidates) {
    const exactMatch = aliasMap.get(candidate)
    if (exactMatch) return exactMatch
  }

  const primaryInput = candidates[0] ?? normalizeAliasKey(compact)
  if (primaryInput.length < 4) return compact

  const aliases = buildComparableAliasList(aliasMap)
  let bestAlias: string | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (const alias of aliases) {
    const distance = levenshteinDistance(primaryInput, alias)
    if (distance < bestDistance) {
      bestDistance = distance
      bestAlias = alias
      if (distance === 0) break
    }
  }

  if (!bestAlias) return compact

  const maxLength = Math.max(primaryInput.length, bestAlias.length)
  const threshold = Math.max(1, Math.floor(maxLength * 0.3))
  if (bestDistance > threshold) return compact

  return aliasMap.get(bestAlias) ?? compact
}

export function detectCountryInText(
  text: string | null | undefined,
  aliasMap: CountryAliasMap,
): string | null {
  if (typeof text !== "string") return null
  const normalizedText = normalizeAliasKey(text)
  if (!normalizedText) return null

  const haystack = ` ${normalizedText} `
  const aliasesBySpecificity = Array.from(aliasMap.keys())
    .filter((alias) => alias.length >= 3)
    .sort((first, second) => second.length - first.length)

  for (const alias of aliasesBySpecificity) {
    if (haystack.includes(` ${alias} `)) {
      return aliasMap.get(alias) ?? null
    }
  }

  return null
}

