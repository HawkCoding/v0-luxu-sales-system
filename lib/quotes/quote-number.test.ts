import { describe, expect, it } from "vitest"
import { isQuoteNumberConflict, reviseQuoteNumber } from "./quote-number"

describe("reviseQuoteNumber", () => {
  it("bumps the parent version when it is the highest", () => {
    expect(reviseQuoteNumber("LTT-26-0001-Q1", "LTT-26-0001", [{ quote_number: "LTT-26-0001-Q1" }])).toBe("LTT-26-0001-Q2")
  })

  it("skips versions already taken when revising an older quote", () => {
    const existing = [{ quote_number: "LTT-26-0001-Q1" }, { quote_number: "LTT-26-0001-Q2" }]
    expect(reviseQuoteNumber("LTT-26-0001-Q1", "LTT-26-0001", existing)).toBe("LTT-26-0001-Q3")
  })

  it("handles missing and unversioned numbers", () => {
    expect(reviseQuoteNumber(null, "LTT-26-0001")).toBe("LTT-26-0001-Q2")
    expect(reviseQuoteNumber("LTT-26-0001", "LTT-26-0001")).toBe("LTT-26-0001-Q2")
  })
})

describe("isQuoteNumberConflict", () => {
  it("matches only the quote number unique violation", () => {
    expect(isQuoteNumberConflict({ code: "23505", message: 'duplicate key ... "idx_quotes_quote_number_unique"' })).toBe(true)
    expect(isQuoteNumberConflict({ code: "23505", message: "duplicate key ... other_idx" })).toBe(false)
    expect(isQuoteNumberConflict(null)).toBe(false)
  })
})
