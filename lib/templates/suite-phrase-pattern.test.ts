import { describe, expect, it } from "vitest"

import { findUnknownSuitePatternTokens, renderSuitePhrasePattern } from "@/lib/templates/suite-phrase-pattern"

const full = { type: "Deluxe Suite", bedroom: "Double", layout: "Crosswise", bathroom: "Shower" }

describe("renderSuitePhrasePattern", () => {
  it("substitutes every token", () => {
    expect(renderSuitePhrasePattern("[{bedroom}] [{layout}] {type}", full)).toBe(
      "Double Crosswise Deluxe Suite",
    )
  })

  it("drops a group whole when its token is empty", () => {
    expect(
      renderSuitePhrasePattern("[{bedroom}] [{layout}] {type}", { ...full, bedroom: "" }),
    ).toBe("Crosswise Deluxe Suite")
  })

  it("drops multiple empty groups, leaving just the type", () => {
    expect(
      renderSuitePhrasePattern("[{bedroom}] [{layout}] {type}", {
        ...full,
        bedroom: "",
        layout: "",
      }),
    ).toBe("Deluxe Suite")
  })

  it("keeps literal words attached to their group, dropped together", () => {
    expect(
      renderSuitePhrasePattern("[{bedroom} bedded] {type} [with a {bathroom}]", {
        ...full,
        bathroom: "",
      }),
    ).toBe("Double bedded Deluxe Suite")
  })

  it("matches today's default grammar shape when fully populated", () => {
    expect(
      renderSuitePhrasePattern("[{bedroom} bedded] {type} [with a {bathroom}]", full),
    ).toBe("Double bedded Deluxe Suite with a Shower")
  })

  it("substitutes a bare token outside any group with the empty string", () => {
    expect(renderSuitePhrasePattern("{type} - {bedroom}", { ...full, bedroom: "" })).toBe(
      "Deluxe Suite -",
    )
  })

  it("returns empty string when the type is empty, regardless of pattern", () => {
    expect(renderSuitePhrasePattern("[{bedroom}] {type}", { ...full, type: "" })).toBe("")
  })

  it("treats an unmatched bracket as a literal character", () => {
    expect(renderSuitePhrasePattern("{type} [oops", full)).toBe("Deluxe Suite [oops")
  })

  it("collapses whitespace left behind by dropped groups", () => {
    expect(
      renderSuitePhrasePattern("{type}   [{bedroom}]   [{layout}]", {
        ...full,
        bedroom: "",
        layout: "",
      }),
    ).toBe("Deluxe Suite")
  })

  it("passes literal text through untouched when it has no tokens", () => {
    expect(renderSuitePhrasePattern("Just some text", full)).toBe("Just some text")
  })
})

describe("findUnknownSuitePatternTokens", () => {
  it("returns nothing for a blank pattern", () => {
    expect(findUnknownSuitePatternTokens(null)).toEqual([])
    expect(findUnknownSuitePatternTokens("")).toEqual([])
  })

  it("returns nothing when every token is known", () => {
    expect(findUnknownSuitePatternTokens("[{bedroom}] [{layout}] {type} {bathroom}")).toEqual([])
  })

  it("flags an unknown token", () => {
    expect(findUnknownSuitePatternTokens("[{bedrom}] {type}")).toEqual(["bedrom"])
  })

  it("dedupes repeated unknown tokens, in order of first appearance", () => {
    expect(findUnknownSuitePatternTokens("{foo} {type} {bar} {foo}")).toEqual(["foo", "bar"])
  })
})
