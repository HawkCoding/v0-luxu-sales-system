import { describe, expect, it } from "vitest"

import { tintWithWhite, voucherTokens } from "../design-tokens"

describe("tintWithWhite", () => {
  it("blends a 6-digit hex toward white", () => {
    expect(tintWithWhite("#0B2A3A", 0.45)).toBe("#919fa6")
  })

  it("returns the original colour at full strength", () => {
    expect(tintWithWhite("#0B2A3A", 1)).toBe("#0b2a3a")
  })

  it("returns white at zero strength", () => {
    expect(tintWithWhite("#0B2A3A", 0)).toBe("#ffffff")
  })

  it("expands a 3-digit hex", () => {
    expect(tintWithWhite("#000", 0.5)).toBe("#808080")
  })

  it("accepts hex without a leading hash", () => {
    expect(tintWithWhite("000000", 1)).toBe("#000000")
  })

  it("clamps strength into [0, 1]", () => {
    expect(tintWithWhite("#000000", 2)).toBe("#000000")
    expect(tintWithWhite("#000000", -1)).toBe("#ffffff")
  })

  it("falls back to black for invalid hex", () => {
    expect(tintWithWhite("not-a-colour", 1)).toBe("#000000")
  })
})

describe("voucherTokens", () => {
  it("derives all tones from the template colours", () => {
    const tokens = voucherTokens({ accentColour: "#0B2A3A", sectionBg: "#1a3a4a" })

    expect(tokens).toEqual({
      accent: "#0B2A3A",
      eyebrow: "#1a3a4a",
      frameOuter: tintWithWhite("#0B2A3A", 0.9),
      frameInner: tintWithWhite("#0B2A3A", 0.35),
      rule: tintWithWhite("#0B2A3A", 0.45),
      ruleFaint: tintWithWhite("#1a3a4a", 0.3),
      ink: "#2B2B2B",
      inkMuted: "#6B6B6B",
      inkFaint: "#9A9A9A",
      rowShade: "#F4F4F4",
    })
  })
})
