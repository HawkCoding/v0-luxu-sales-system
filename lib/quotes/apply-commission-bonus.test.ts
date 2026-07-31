import { describe, expect, it } from "vitest"
import { applyCommissionBonus, getCommissionBonus } from "@/lib/quotes/apply-commission-bonus"
import type { CommissionBreakdown, PricingSnapshot, QuoteLineItem } from "@/lib/types"

function snapshot(commission: CommissionBreakdown | null, unit: string | null = null): PricingSnapshot {
  return {
    source: "pricing_engine",
    pricingMode: "rate_card",
    packageId: "pkg-1",
    packageName: "Blue Train",
    legId: null,
    legLabel: null,
    supplierId: null,
    supplierName: null,
    supplierKind: null,
    routeId: null,
    routeName: null,
    suiteTypeId: null,
    suiteTypeName: null,
    rateCardId: null,
    travelDate: "2026-09-01",
    passengerKind: "service",
    baseUnitPrice: 0,
    markupPct: 0,
    singleSupplementPct: null,
    serviceType: null,
    commission,
    unit,
  }
}

const travelLine: QuoteLineItem = {
  description: "The Blue Train — Adult",
  supplierDescription: null,
  qty: 2,
  unitPrice: 50_000,
  total: 100_000,
  pricingSnapshot: snapshot(null),
}

function percentCommissionLine(amount = 10_000): QuoteLineItem {
  return {
    description: "Commission",
    supplierDescription: null,
    qty: 1,
    unitPrice: amount,
    total: amount,
    pricingSnapshot: snapshot({ type: "percent", value: 10, amount, source: "line" }),
  }
}

function fixedCommissionLine(amount = 5_000): QuoteLineItem {
  return {
    description: "Commission",
    supplierDescription: null,
    qty: 1,
    unitPrice: amount,
    total: amount,
    pricingSnapshot: snapshot({ type: "fixed", value: amount, amount, source: "line" }),
  }
}

function perPersonCommissionLine(value = 1_000, pax = 4): QuoteLineItem {
  return {
    description: "Commission",
    supplierDescription: null,
    qty: pax,
    unitPrice: value,
    total: value * pax,
    pricingSnapshot: snapshot(
      { type: "per_person", value, amount: value * pax, source: "line", passengerCount: pax },
      "per person",
    ),
  }
}

describe("applyCommissionBonus", () => {
  it("adds a flat bonus to a percent commission line without creating a new line", () => {
    const result = applyCommissionBonus([travelLine, percentCommissionLine()], 400)

    expect(result).toHaveLength(2)
    expect(result[1].description).toBe("Commission")
    expect(result[1].qty).toBe(1)
    expect(result[1].unitPrice).toBe(10_400)
    expect(result[1].total).toBe(10_400)
    expect(getCommissionBonus(result[1])).toBe(400)
  })

  it("collapses a per-person commission line to qty 1 so total stays unitPrice * qty", () => {
    const result = applyCommissionBonus([travelLine, perPersonCommissionLine()], 400)

    expect(result[1].qty).toBe(1)
    expect(result[1].unitPrice).toBe(4_400)
    expect(result[1].total).toBe(4_400)
    expect(result[1].unitPrice * result[1].qty).toBe(result[1].total)
    expect(result[1].pricingSnapshot?.unit).toBeNull()
  })

  it("never compounds when the bonus is changed repeatedly", () => {
    const lines = [travelLine, percentCommissionLine()]
    const first = applyCommissionBonus(lines, 400)
    const second = applyCommissionBonus(first, 220)
    const third = applyCommissionBonus(second, 220)

    expect(second[1].total).toBe(10_220)
    expect(third[1].total).toBe(10_220)
  })

  it("restores the calculated percent commission when the bonus is cleared", () => {
    const withBonus = applyCommissionBonus([travelLine, percentCommissionLine()], 400)
    const cleared = applyCommissionBonus(withBonus, 0)

    expect(cleared[1].qty).toBe(1)
    expect(cleared[1].unitPrice).toBe(10_000)
    expect(cleared[1].total).toBe(10_000)
    expect(getCommissionBonus(cleared[1])).toBe(0)
  })

  it("adds a flat bonus to a fixed commission line, staying qty 1", () => {
    const result = applyCommissionBonus([travelLine, fixedCommissionLine()], 400)

    expect(result[1].qty).toBe(1)
    expect(result[1].unitPrice).toBe(5_400)
    expect(result[1].total).toBe(5_400)
  })

  it("restores the flat fixed commission when the bonus is cleared", () => {
    const withBonus = applyCommissionBonus([travelLine, fixedCommissionLine()], 400)
    const cleared = applyCommissionBonus(withBonus, 0)

    expect(cleared[1].qty).toBe(1)
    expect(cleared[1].unitPrice).toBe(5_000)
    expect(cleared[1].total).toBe(5_000)
    expect(cleared[1].pricingSnapshot?.unit).toBeNull()
  })

  it("restores per-person qty and unit label when the bonus is cleared", () => {
    const withBonus = applyCommissionBonus([travelLine, perPersonCommissionLine()], 400)
    const cleared = applyCommissionBonus(withBonus, 0)

    expect(cleared[1].qty).toBe(4)
    expect(cleared[1].unitPrice).toBe(1_000)
    expect(cleared[1].total).toBe(4_000)
    expect(cleared[1].pricingSnapshot?.unit).toBe("per person")
  })

  it("recovers per-person qty from the amount when passengerCount is missing", () => {
    const legacy: QuoteLineItem = {
      description: "Commission",
      supplierDescription: null,
      qty: 3,
      unitPrice: 500,
      total: 1_500,
      pricingSnapshot: snapshot({ type: "per_person", value: 500, amount: 1_500, source: "line" }, "per person"),
    }

    const cleared = applyCommissionBonus(applyCommissionBonus([travelLine, legacy], 250), 0)

    expect(cleared[1].qty).toBe(3)
    expect(cleared[1].unitPrice).toBe(500)
  })

  it("appends a bonus-only Commission line when the quote has none", () => {
    const result = applyCommissionBonus([travelLine], 750)

    expect(result).toHaveLength(2)
    expect(result[1].description).toBe("Commission")
    expect(result[1].qty).toBe(1)
    expect(result[1].total).toBe(750)
    expect(result[1].pricingSnapshot?.commission).toMatchObject({ amount: 0, bonus: 750 })
  })

  it("is a no-op when there is no commission line and no bonus", () => {
    const result = applyCommissionBonus([travelLine], 0)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(travelLine)
  })

  it("does not mutate the input array", () => {
    const lines = [travelLine, percentCommissionLine()]
    applyCommissionBonus(lines, 400)

    expect(lines[1].total).toBe(10_000)
  })

  it("rounds the bonus to cents", () => {
    const result = applyCommissionBonus([travelLine, percentCommissionLine()], 400.005)

    expect(result[1].total).toBe(10_400.01)
  })

  it("subtracts a negative rounding amount from a percent commission line", () => {
    const result = applyCommissionBonus([travelLine, percentCommissionLine()], -50)

    expect(result[1].qty).toBe(1)
    expect(result[1].unitPrice).toBe(9_950)
    expect(result[1].total).toBe(9_950)
    expect(getCommissionBonus(result[1])).toBe(-50)
  })

  it("restores the calculated commission when a negative rounding is cleared", () => {
    const withRounding = applyCommissionBonus([travelLine, percentCommissionLine()], -50)
    const cleared = applyCommissionBonus(withRounding, 0)

    expect(cleared[1].total).toBe(10_000)
    expect(getCommissionBonus(cleared[1])).toBe(0)
  })
})
