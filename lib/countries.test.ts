import { describe, expect, it } from "vitest"
import {
  detectCountryInText,
  levenshteinDistance,
  normalizeCountry,
  type CountryAliasMap,
} from "@/lib/countries"

function createAliasMap(): CountryAliasMap {
  return new Map<string, string>([
    ["south africa", "South Africa"],
    ["rsa", "South Africa"],
    ["sa", "South Africa"],
    ["republic of south africa", "South Africa"],
    ["za", "South Africa"],
    ["united states", "United States"],
    ["united states of america", "United States"],
    ["usa", "United States"],
    ["us", "United States"],
    ["america", "United States"],
    ["united kingdom", "United Kingdom"],
    ["uk", "United Kingdom"],
    ["gb", "United Kingdom"],
    ["great britain", "United Kingdom"],
    ["other", "Other"],
  ])
}

describe("levenshteinDistance", () => {
  it("returns zero for equal strings", () => {
    expect(levenshteinDistance("south africa", "south africa")).toBe(0)
  })

  it("returns expected edit distance", () => {
    expect(levenshteinDistance("soth africa", "south africa")).toBe(1)
    expect(levenshteinDistance("untied states", "united states")).toBe(2)
  })
})

describe("normalizeCountry", () => {
  it("returns null for nullish and empty input", () => {
    const aliasMap = createAliasMap()

    expect(normalizeCountry(null, aliasMap)).toBeNull()
    expect(normalizeCountry(undefined, aliasMap)).toBeNull()
    expect(normalizeCountry("   ", aliasMap)).toBeNull()
  })

  it("matches aliases case-insensitively", () => {
    const aliasMap = createAliasMap()

    expect(normalizeCountry("RSA", aliasMap)).toBe("South Africa")
    expect(normalizeCountry("republic of south africa", aliasMap)).toBe("South Africa")
    expect(normalizeCountry("uSa", aliasMap)).toBe("United States")
  })

  it("fuzzy-matches common misspellings", () => {
    const aliasMap = createAliasMap()

    expect(normalizeCountry("Soth Africa", aliasMap)).toBe("South Africa")
    expect(normalizeCountry("Untied States", aliasMap)).toBe("United States")
  })

  it("keeps unmatched country values unchanged", () => {
    const aliasMap = createAliasMap()
    expect(normalizeCountry("Atlantis", aliasMap)).toBe("Atlantis")
  })
})

describe("detectCountryInText", () => {
  it("detects countries from enquiry text", () => {
    const aliasMap = createAliasMap()
    const text =
      "Hi team, we are travelling from Johannesburg. We are based in the Republic of South Africa."

    expect(detectCountryInText(text, aliasMap)).toBe("South Africa")
  })

  it("returns null when no country can be detected", () => {
    const aliasMap = createAliasMap()
    expect(detectCountryInText("No location provided.", aliasMap)).toBeNull()
  })
})

