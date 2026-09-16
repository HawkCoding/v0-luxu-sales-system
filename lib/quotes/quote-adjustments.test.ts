import { describe, expect, it } from "vitest"
import { computeQuoteAdjustments, type QuoteAdjustmentsInput } from "@/lib/quotes/quote-adjustments"
import type { QuoteLineItem } from "@/lib/types"

const SERVICE_LINE: QuoteLineItem = {
  description: "Rovos Rail - Golf Safari",
  supplierDescription: null,
  qty: 2,
  unitPrice: 125_000,
  total: 250_000,
  pricingSnapshot: null,
}

const NO_ADJUSTMENTS: QuoteAdjustmentsInput = {
  commission: null,
  commissionBonus: 0,
  agentCommission: 0,
  discount: null,
  bookingHeadcount: 2,
}

describe("computeQuoteAdjustments", () => {
  it("passes a bare line through unchanged when nothing is configured", () => {
    const result = computeQuoteAdjustments([SERVICE_LINE], NO_ADJUSTMENTS)

    expect(result.errors).toEqual([])
    expect(result.lineItems).toHaveLength(1)
    expect(result.servicesSubtotal).toBe(250_000)
    expect(result.subtotal).toBe(250_000)
    expect(result.total).toBe(250_000)
  })

  it("adds a percent commission line based on the services subtotal", () => {
    const result = computeQuoteAdjustments([SERVICE_LINE], {
      ...NO_ADJUSTMENTS,
      commission: { type: "percent", value: 10 },
    })

    expect(result.errors).toEqual([])
    expect(result.lineItems).toHaveLength(2)
    expect(result.commissionAmount).toBe(25_000)
    expect(result.subtotal).toBe(275_000)
    expect(result.total).toBe(275_000)
  })

  it("folds Rounding into the Commission line without compounding on repeated calls", () => {
    const withCommission = computeQuoteAdjustments([SERVICE_LINE], {
      ...NO_ADJUSTMENTS,
      commission: { type: "percent", value: 10 },
      commissionBonus: 50,
    })
    expect(withCommission.subtotal).toBe(275_050)

    // Re-running against the already-bonused line items must not compound the bonus.
    const again = computeQuoteAdjustments(withCommission.lineItems, {
      ...NO_ADJUSTMENTS,
      commission: { type: "percent", value: 10 },
      commissionBonus: 50,
    })
    expect(again.subtotal).toBe(275_050)
  })

  it("rejects a negative Rounding value", () => {
    const result = computeQuoteAdjustments([SERVICE_LINE], { ...NO_ADJUSTMENTS, commissionBonus: -10 })
    expect(result.errors).toContain("Rounding can't be negative — use a discount instead.")
  })

  it("deducts Agent Commission from the total but not the subtotal", () => {
    const result = computeQuoteAdjustments([SERVICE_LINE], { ...NO_ADJUSTMENTS, agentCommission: 20_000 })
    expect(result.subtotal).toBe(250_000)
    expect(result.total).toBe(230_000)
  })

  it("resolves a percent Discount against the subtotal produced by this same call", () => {
    const result = computeQuoteAdjustments([SERVICE_LINE], {
      ...NO_ADJUSTMENTS,
      commission: { type: "percent", value: 10 },
      discount: { type: "percent", value: 5, visible: true },
    })

    // Subtotal after Commission is 275 000; 5% of that is 13 750 — not 5% of the bare 250 000.
    expect(result.subtotal).toBe(275_000)
    expect(result.discountAmount).toBe(13_750)
    expect(result.total).toBe(261_250)
  })

  it("recalculates an existing percent Discount when Commission changes on the same save", () => {
    // Regression: the old per-field routes reused the stored discount_amount, so a Commission
    // edit silently left Discount pegged to the pre-edit subtotal.
    const before = computeQuoteAdjustments([SERVICE_LINE], {
      ...NO_ADJUSTMENTS,
      commission: { type: "percent", value: 10 },
      discount: { type: "percent", value: 5, visible: true },
    })
    const after = computeQuoteAdjustments(before.lineItems, {
      ...NO_ADJUSTMENTS,
      commission: { type: "percent", value: 12 },
      discount: { type: "percent", value: 5, visible: true },
    })

    expect(after.subtotal).toBe(280_000)
    expect(after.discountAmount).toBe(14_000)
  })

  it("keeps a percent Discount amount stable when Rounding changes", () => {
    // Rounding is applied last — nudging it must not move the Discount rand amount, only Total.
    const noRounding = computeQuoteAdjustments([SERVICE_LINE], {
      ...NO_ADJUSTMENTS,
      commission: { type: "percent", value: 10 },
      commissionBonus: 0,
      discount: { type: "percent", value: 5, visible: true },
    })
    const withRounding = computeQuoteAdjustments([SERVICE_LINE], {
      ...NO_ADJUSTMENTS,
      commission: { type: "percent", value: 10 },
      commissionBonus: 50,
      discount: { type: "percent", value: 5, visible: true },
    })

    expect(noRounding.discountAmount).toBe(13_750)
    expect(withRounding.discountAmount).toBe(13_750)
    expect(withRounding.subtotal).toBe(275_050)
    expect(withRounding.total).toBe(261_300)
  })

  it("errors when Agent Commission and Discount together exceed the subtotal", () => {
    const result = computeQuoteAdjustments([SERVICE_LINE], {
      ...NO_ADJUSTMENTS,
      agentCommission: 200_000,
      discount: { type: "fixed", value: 100_000, visible: true },
    })
    expect(result.errors).toContain("Agent Commission and Discount together cannot exceed the quote subtotal.")
  })

  it("floors the total at 0 rather than going negative", () => {
    const result = computeQuoteAdjustments([{ ...SERVICE_LINE, total: 1000, unitPrice: 500 }], {
      ...NO_ADJUSTMENTS,
      agentCommission: 5000,
    })
    expect(result.total).toBe(0)
  })

  it("removes the Commission line entirely when commission is cleared to null", () => {
    const withCommission = computeQuoteAdjustments([SERVICE_LINE], {
      ...NO_ADJUSTMENTS,
      commission: { type: "percent", value: 10 },
    })
    const cleared = computeQuoteAdjustments(withCommission.lineItems, NO_ADJUSTMENTS)

    expect(cleared.lineItems).toHaveLength(1)
    expect(cleared.subtotal).toBe(250_000)
  })

  it("computes a per_person commission off the booking headcount when no breakdown exists yet", () => {
    const result = computeQuoteAdjustments([SERVICE_LINE], {
      ...NO_ADJUSTMENTS,
      commission: { type: "per_person", value: 500 },
      bookingHeadcount: 3,
    })
    expect(result.commissionAmount).toBe(1500)
  })
})
