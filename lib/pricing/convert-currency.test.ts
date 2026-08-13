import { describe, expect, it } from "vitest"
import {
  applyFxRate,
  convertAmount,
  MissingFxRateError,
  roundFxRate,
  type FxRateMap,
} from "@/lib/pricing/convert-currency"

/** 1 USD = 17.25 ZAR, 1 EUR = 18.90 ZAR. */
const RATES: FxRateMap = { ZAR: 1, USD: 17.25, EUR: 18.9 }

describe("convertAmount", () => {
  it("is an identity for the same currency, with rate 1", () => {
    expect(convertAmount(6400, "USD", "USD", RATES)).toEqual({ amount: 6400, rate: 1 })
    expect(convertAmount(110400, "ZAR", "ZAR", {})).toEqual({ amount: 110400, rate: 1 })
  })

  it("converts a foreign rate into the base currency", () => {
    // The screenshot case: a USD 6 400 suite on a rand quote.
    expect(convertAmount(6400, "USD", "ZAR", RATES)).toEqual({ amount: 110400, rate: 17.25 })
  })

  it("converts the base currency back out to a foreign one", () => {
    // The inverse rate is ~0.058, which is why roundFxRate keeps 6 decimals rather than 4 — at
    // 4 this round-trip would land several dollars off on a six-figure rand total.
    const { amount, rate } = convertAmount(110400, "ZAR", "USD", RATES)
    expect(rate).toBeCloseTo(1 / 17.25, 6)
    expect(amount).toBeCloseTo(6400, 1)
  })

  it("crosses two foreign currencies via the base", () => {
    const { rate } = convertAmount(100, "EUR", "USD", RATES)
    expect(rate).toBe(roundFxRate(18.9 / 17.25))
  })

  it("rounds the result to cents", () => {
    expect(convertAmount(33.333, "USD", "ZAR", RATES).amount).toBe(
      Math.round(33.333 * 17.25 * 100) / 100,
    )
  })

  it("stamps a rate that reproduces the amount, so a salesperson can check the arithmetic", () => {
    const { amount, rate } = convertAmount(6400, "USD", "ZAR", RATES)
    expect(Math.round(6400 * rate * 100) / 100).toBe(amount)
  })

  it("normalises casing and whitespace on both codes", () => {
    expect(convertAmount(100, " usd ", "zar", RATES).amount).toBe(1725)
  })

  it("throws rather than assuming parity when a rate is missing", () => {
    // Treating an absent USD rate as 1 is exactly the ~17x mispricing this exists to prevent.
    expect(() => convertAmount(6400, "USD", "ZAR", { ZAR: 1 })).toThrow(MissingFxRateError)
    expect(() => convertAmount(6400, "GBP", "ZAR", RATES)).toThrow(MissingFxRateError)
  })

  it("throws on a zero, negative or non-finite rate", () => {
    expect(() => convertAmount(100, "USD", "ZAR", { ZAR: 1, USD: 0 })).toThrow(MissingFxRateError)
    expect(() => convertAmount(100, "USD", "ZAR", { ZAR: 1, USD: -5 })).toThrow(MissingFxRateError)
    expect(() => convertAmount(100, "USD", "ZAR", { ZAR: 1, USD: NaN })).toThrow(MissingFxRateError)
  })

  it("names both currencies in the error so the fix is obvious", () => {
    try {
      convertAmount(100, "GBP", "ZAR", RATES)
      expect.unreachable("should have thrown")
    } catch (error) {
      expect(error).toBeInstanceOf(MissingFxRateError)
      expect((error as MissingFxRateError).message).toContain("GBP")
      expect((error as MissingFxRateError).message).toContain("ZAR")
    }
  })

  it("converts zero without needing special handling", () => {
    expect(convertAmount(0, "USD", "ZAR", RATES).amount).toBe(0)
  })
})

describe("roundFxRate", () => {
  it("keeps six decimals, so a hand-typed four-decimal rate round-trips unchanged", () => {
    expect(roundFxRate(17.25)).toBe(17.25)
    expect(roundFxRate(17.2568)).toBe(17.2568)
    expect(roundFxRate(1 / 3)).toBe(0.333333)
  })
})

describe("applyFxRate", () => {
  it("applies an already-decided rate without re-deriving it", () => {
    // The salesperson nudged 17.25 up to 17.30; that number, not the market's, must be used.
    expect(applyFxRate(6400, 17.3)).toBe(110720)
  })

  it("rounds to cents", () => {
    expect(applyFxRate(33.333, 17.25)).toBe(574.99)
  })
})
