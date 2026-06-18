import { describe, expect, it } from "vitest"
import { applyRateMarkdown } from "./rate-markdown"

describe("applyRateMarkdown", () => {
  it("applies a 20% markdown off the default rate", () => {
    expect(applyRateMarkdown(1000, 20)).toBe(800)
  })

  it("applies a 50% markdown off the default rate", () => {
    expect(applyRateMarkdown(1000, 50)).toBe(500)
  })

  it("returns the base price for a 0% markdown", () => {
    expect(applyRateMarkdown(2499, 0)).toBe(2499)
  })

  it("rounds to two decimal places", () => {
    expect(applyRateMarkdown(999.99, 33.33)).toBe(666.69)
  })
})
