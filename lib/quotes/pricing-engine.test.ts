import { describe, expect, it } from "vitest"
import type { QuoteLineItem } from "@/lib/types"
import {
  calculateQuoteTotals,
  complimentaryNights,
  hasComplimentaryNight,
  isComplimentaryTransport,
  isFreeHotelOccupant,
  isMissingPricing,
  resolveLineTotal,
  stayNights,
} from "@/lib/quotes/pricing-engine"

describe("calculateQuoteTotals", () => {
  const lines: QuoteLineItem[] = [
    { description: "Line 1", qty: 1, unitPrice: 60000, total: 60000 },
    { description: "Line 2", qty: 1, unitPrice: 40000, total: 40000 },
  ]

  it("keeps total === subtotal when no agent commission is passed (default arg)", () => {
    expect(calculateQuoteTotals(lines)).toEqual({ subtotal: 100000, total: 100000 })
  })

  it("subtracts a positive agent commission from the subtotal to give the total", () => {
    expect(calculateQuoteTotals(lines, 5000)).toEqual({ subtotal: 100000, total: 95000 })
  })

  it("clamps the total at zero rather than going negative", () => {
    expect(calculateQuoteTotals(lines, 500000)).toEqual({ subtotal: 100000, total: 0 })
  })

  it("ignores a negative commission rather than adding it back", () => {
    expect(calculateQuoteTotals(lines, -5000)).toEqual({ subtotal: 100000, total: 100000 })
  })
})

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

  it("does not flag a transfer marked complimentary", () => {
    const comped = line({
      unitPrice: 0,
      pricingSnapshot: { pricingMode: "rate_card", isComplimentaryTransport: true } as QuoteLineItem["pricingSnapshot"],
    })
    expect(isMissingPricing(comped)).toBe(false)
  })

  it("does not flag a commission line deliberately set to 0%", () => {
    const zeroCommission = line({
      description: "Commission",
      unitPrice: 0,
      pricingSnapshot: {
        commission: { type: "percent", value: 0, amount: 0, source: "line" },
      } as QuoteLineItem["pricingSnapshot"],
    })
    expect(isMissingPricing(zeroCommission)).toBe(false)
  })

  it("flags a commission line that was never configured", () => {
    const unconfigured = line({
      description: "Commission",
      unitPrice: 0,
      pricingSnapshot: { commission: null } as QuoteLineItem["pricingSnapshot"],
    })
    expect(isMissingPricing(unconfigured)).toBe(true)
  })
})

describe("isComplimentaryTransport", () => {
  it("reads the dedicated flag, independent of manualTransportPrice", () => {
    const comped: QuoteLineItem = {
      description: "Transfer",
      qty: 1,
      unitPrice: 0,
      total: 0,
      pricingSnapshot: { pricingMode: "rate_card", isComplimentaryTransport: true } as QuoteLineItem["pricingSnapshot"],
    }
    expect(isComplimentaryTransport(comped)).toBe(true)
  })

  it("does not flag a plain manual R0 transfer price as complimentary", () => {
    const zeroOverride: QuoteLineItem = {
      description: "Transfer",
      qty: 1,
      unitPrice: 0,
      total: 0,
      pricingSnapshot: { pricingMode: "rate_card", manualTransportPrice: 0 } as QuoteLineItem["pricingSnapshot"],
    }
    expect(isComplimentaryTransport(zeroOverride)).toBe(false)
  })
})

describe("complimentary nights", () => {
  const gifted = (overrides: Partial<QuoteLineItem> = {}): QuoteLineItem => ({
    description: "Standard Room",
    qty: 3,
    unitPrice: 4000,
    total: 12000,
    pricingSnapshot: {
      pricingMode: "rate_card",
      complimentaryNights: 1,
      stayNights: 4,
    } as QuoteLineItem["pricingSnapshot"],
    ...overrides,
  })

  it("reads the gifted night count and the full stay off the snapshot", () => {
    expect(complimentaryNights(gifted())).toBe(1)
    expect(stayNights(gifted())).toBe(4)
    expect(hasComplimentaryNight(gifted())).toBe(true)
  })

  it("falls back to the line's qty as the stay when nothing was gifted", () => {
    const plain: QuoteLineItem = { description: "Room", qty: 2, unitPrice: 4000, total: 8000 }
    expect(complimentaryNights(plain)).toBe(0)
    expect(hasComplimentaryNight(plain)).toBe(false)
    expect(stayNights(plain)).toBe(2)
  })

  it("does not flag a one-night stay whose only night was gifted as unpriced", () => {
    const wholeStayGifted = gifted({
      qty: 0,
      unitPrice: 0,
      total: 0,
      pricingSnapshot: {
        pricingMode: "rate_card",
        complimentaryNights: 1,
        stayNights: 1,
      } as QuoteLineItem["pricingSnapshot"],
    })
    expect(isMissingPricing(wholeStayGifted)).toBe(false)
  })
})

describe("resolveLineTotal", () => {
  it("recomputes an ordinary line from qty x unitPrice, ignoring whatever total arrived", () => {
    expect(
      resolveLineTotal({ qty: 3, unitPrice: 1200, pricingSnapshot: null }),
    ).toBe(3600)
  })

  // The defect this exists for: every quote write recomputed qty x unitPrice, which turned a comped
  // transfer's deliberate R0 back into a charge that then flowed into the deposit and final
  // invoices — while the line's own description still read "COMPLIMENTARY".
  it("keeps a comped transfer at zero while its unitPrice still shows what the trip was worth", () => {
    const comped = {
      qty: 1,
      unitPrice: 1800,
      pricingSnapshot: { isComplimentaryTransport: true } as QuoteLineItem["pricingSnapshot"],
    }
    expect(resolveLineTotal(comped)).toBe(0)
    expect(comped.unitPrice).toBe(1800)
  })

  it("does not treat an ordinary transfer line as comped", () => {
    expect(
      resolveLineTotal({
        qty: 2,
        unitPrice: 900,
        pricingSnapshot: { isComplimentaryTransport: false } as QuoteLineItem["pricingSnapshot"],
      }),
    ).toBe(1800)
  })

  it("rounds to cents rather than carrying a float artefact into the invoice", () => {
    expect(resolveLineTotal({ qty: 3, unitPrice: 0.1, pricingSnapshot: null })).toBe(0.3)
  })
})

describe("isFreeHotelOccupant", () => {
  function hotelLine(passengerKind: "adult" | "child" | "infant"): QuoteLineItem {
    return {
      description: "Kruger Shalati",
      qty: 3,
      unitPrice: 0,
      total: 0,
      pricingSnapshot: { supplierKind: "hotel_property", passengerKind } as QuoteLineItem["pricingSnapshot"],
    }
  }

  // A hotel room type that sets no child rate is one where a child sharing costs nothing extra.
  // The line is still emitted so the guest appears on the itinerary, and it is finished, not
  // waiting on a number.
  it("treats a zero-priced child or infant on a hotel line as deliberate", () => {
    expect(isMissingPricing(hotelLine("child"))).toBe(false)
    expect(isMissingPricing(hotelLine("infant"))).toBe(false)
  })

  it("still flags a zero-priced adult, which is a room nobody has priced", () => {
    expect(isMissingPricing(hotelLine("adult"))).toBe(true)
  })
})
