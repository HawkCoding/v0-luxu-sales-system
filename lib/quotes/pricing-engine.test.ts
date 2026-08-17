import { describe, expect, it } from "vitest"
import type { QuoteLineItem } from "@/lib/types"
import { isMissingPricing } from "@/lib/quotes/pricing-engine"

describe("isMissingPricing", () => {
  const line = (overrides: Partial<QuoteLineItem>): QuoteLineItem => ({
    description: "Line",
    qty: 1,
    unitPrice: 0,
    total: 0,
    ...overrides,
  })

  it("flags a zero-priced line with no pricing snapshot", () => {
    expect(isMissingPricing(line({ unitPrice: 0 }))).toBe(true)
  })

  it("does not flag a fixed-price package inclusion", () => {
    const inclusion = line({
      unitPrice: 0,
      pricingSnapshot: { pricingMode: "fixed_package" } as QuoteLineItem["pricingSnapshot"],
    })
    expect(isMissingPricing(inclusion)).toBe(false)
  })

  it("does not flag a line that has a price", () => {
    expect(isMissingPricing(line({ unitPrice: 24800, total: 24800 }))).toBe(false)
  })

  it("flags an unpriced extra even on a fixed-price package quote", () => {
    const unpricedExtra = line({
      unitPrice: 0,
      pricingSnapshot: { pricingMode: "rate_card", isExtra: true } as QuoteLineItem["pricingSnapshot"],
    })
    expect(isMissingPricing(unpricedExtra)).toBe(true)
  })

  it("does not flag a hotel room deliberately overridden to R0 (a supplier comp)", () => {
    const comped = line({
      unitPrice: 0,
      pricingSnapshot: { pricingMode: "rate_card", manualRoomPrice: 0 } as QuoteLineItem["pricingSnapshot"],
    })
    expect(isMissingPricing(comped)).toBe(false)
  })
})
