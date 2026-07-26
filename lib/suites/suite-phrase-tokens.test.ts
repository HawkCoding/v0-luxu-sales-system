import { describe, expect, it } from "vitest"
import {
  SUITE_GENERIC_TOKEN_WEIGHT,
  normalizeSuitePhrase,
  tokenizeSuitePhrase,
  tokenWeight,
} from "@/lib/suites/suite-phrase-tokens"

describe("normalizeSuitePhrase", () => {
  it("lowercases and collapses punctuation to single spaces", () => {
    expect(normalizeSuitePhrase("Deluxe  Twin -- with Shower!")).toBe("deluxe twin with shower")
  })

  it("strips diacritics so accented wording matches plain vocab", () => {
    expect(normalizeSuitePhrase("Coupé Suite")).toBe("coupe suite")
  })

  it("normalizes fractions in bathroom names to separate tokens", () => {
    expect(normalizeSuitePhrase("3/4 bath")).toBe("3 4 bath")
  })

  it("returns an empty string for blank input", () => {
    expect(normalizeSuitePhrase("   ")).toBe("")
  })
})

describe("tokenizeSuitePhrase", () => {
  it("drops filler tokens", () => {
    expect(tokenizeSuitePhrase("Deluxe Twin with shower")).toEqual(["deluxe", "twin", "shower"])
  })

  it("drops number-word filler used in prose enquiries", () => {
    expect(tokenizeSuitePhrase("a Pullman suite for two")).toEqual(["pullman", "suite"])
  })

  it("keeps generic tokens (they are weighted down, not dropped)", () => {
    expect(tokenizeSuitePhrase("Pullman Suite")).toEqual(["pullman", "suite"])
  })

  it("returns an empty array for blank input", () => {
    expect(tokenizeSuitePhrase("")).toEqual([])
  })
})

describe("tokenWeight", () => {
  it("weights generic tokens down", () => {
    expect(tokenWeight("suite")).toBe(SUITE_GENERIC_TOKEN_WEIGHT)
    expect(tokenWeight("room")).toBe(SUITE_GENERIC_TOKEN_WEIGHT)
  })

  it("gives distinguishing tokens full weight", () => {
    expect(tokenWeight("pullman")).toBe(1)
    expect(tokenWeight("deluxe")).toBe(1)
  })
})
