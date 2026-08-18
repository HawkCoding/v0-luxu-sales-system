import { describe, expect, it } from "vitest"
import {
  BASE_CURRENCY,
  currencySymbol,
  formatFxRate,
  formatMoney,
  isSupportedCurrency,
  normaliseCurrency,
} from "@/lib/money"

/** Intl groups with a non-breaking space (U+00A0); collapse it so assertions stay readable. */
function plain(value: string): string {
  return value.replace(/ /g, " ")
}

describe("formatMoney", () => {
  it("emits the symbol for every supported currency", () => {
    expect(plain(formatMoney(1234.5, "ZAR"))).toBe("R1 234,50")
    expect(plain(formatMoney(1234.5, "USD"))).toBe("$1 234,50")
    expect(plain(formatMoney(1234.5, "EUR"))).toBe("€1 234,50")
    expect(plain(formatMoney(1234.5, "GBP"))).toBe("£1 234,50")
  })

  it("defaults to the base currency", () => {
    expect(formatMoney(100)).toBe(formatMoney(100, BASE_CURRENCY))
  })

  it("always shows exactly two decimals", () => {
    expect(plain(formatMoney(1000, "ZAR"))).toBe("R1 000,00")
    expect(plain(formatMoney(0.1 + 0.2, "ZAR"))).toBe("R0,30")
  })

  it("never emits a doubled symbol — callers must not prefix their own", () => {
    // Two migrations exist purely to strip a literal "R" typed in front of these values
    // (20260723130000_fix_double_rand_templates.sql and its all-rows follow-up).
    expect(formatMoney(500, "ZAR")).not.toContain("RR")
    expect(formatMoney(500, "USD").match(/\$/g)).toHaveLength(1)
  })

  it("falls back to a readable string rather than throwing on a malformed code", () => {
    // Intl rejects anything that isn't three letters. A legacy rate card could hold "RAND" or
    // "R" from the days this was free text, and neither may take a quote screen down.
    expect(plain(formatMoney(12.5, "RAND"))).toBe("RAND 12.50")
    expect(plain(formatMoney(12.5, "R"))).toBe("R 12.50")
  })

  it("treats an empty or whitespace code as the base currency", () => {
    expect(formatMoney(10, "")).toBe(formatMoney(10, BASE_CURRENCY))
    expect(formatMoney(10, "  ")).toBe(formatMoney(10, BASE_CURRENCY))
  })

  it("handles negatives and zero", () => {
    expect(plain(formatMoney(0, "ZAR"))).toBe("R0,00")
    expect(formatMoney(-250, "ZAR")).toContain("250,00")
  })
})

describe("currencySymbol", () => {
  it("returns just the symbol", () => {
    expect(currencySymbol("ZAR")).toBe("R")
    expect(currencySymbol("USD")).toBe("$")
    expect(currencySymbol("EUR")).toBe("€")
    expect(currencySymbol("GBP")).toBe("£")
  })

  it("degrades to the code itself when Intl can't resolve one", () => {
    expect(currencySymbol("XYZ")).toBe("XYZ")
  })
})

describe("isSupportedCurrency", () => {
  it("accepts the configured list and nothing else", () => {
    expect(isSupportedCurrency("ZAR")).toBe(true)
    expect(isSupportedCurrency("USD")).toBe(true)
    expect(isSupportedCurrency("AUD")).toBe(false)
    expect(isSupportedCurrency("zar")).toBe(false)
  })
})

describe("normaliseCurrency", () => {
  it("uppercases and trims", () => {
    expect(normaliseCurrency(" usd ")).toBe("USD")
  })

  it("falls back to the base currency for legacy free-text values", () => {
    // rate_cards.currency accepted any 10-char string before this feature; a bad value must
    // never stop a quote from rendering.
    expect(normaliseCurrency("Rand")).toBe(BASE_CURRENCY)
    expect(normaliseCurrency(null)).toBe(BASE_CURRENCY)
    expect(normaliseCurrency(undefined)).toBe(BASE_CURRENCY)
    expect(normaliseCurrency("")).toBe(BASE_CURRENCY)
  })
})

describe("formatFxRate", () => {
  it("shows four decimals so a five-cent nudge is expressible", () => {
    expect(plain(formatFxRate(17.25))).toBe("17,2500")
    expect(plain(formatFxRate(17.3))).toBe("17,3000")
  })

  it("carries no currency symbol — a rate is a multiplier, not an amount", () => {
    expect(formatFxRate(17.25)).not.toMatch(/[R$€£]/)
  })
})
