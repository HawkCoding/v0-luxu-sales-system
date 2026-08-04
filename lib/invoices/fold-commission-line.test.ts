import { describe, expect, it } from "vitest"
import { foldCommissionLines, type FoldableLineItem } from "@/lib/invoices/fold-commission-line"
import type { CommissionBreakdown, PricingSnapshot } from "@/lib/types"

function snapshot(commission: CommissionBreakdown | null): PricingSnapshot {
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
    unit: null,
  }
}

function travelLine(overrides: Partial<FoldableLineItem> = {}): FoldableLineItem {
  return {
    description: "The Blue Train — Adult",
    qty: 2,
    unit_price: 25_000,
    total: 50_000,
    pricing_snapshot: snapshot(null),
    ...overrides,
  }
}

function commissionLine(amount = 5_000): FoldableLineItem {
  return {
    description: "Commission",
    qty: 1,
    unit_price: amount,
    total: amount,
    pricing_snapshot: snapshot({ type: "percent", value: 10, amount, source: "line" }),
  }
}

describe("foldCommissionLines", () => {
  it("removes the commission row and folds its total into the largest remaining line", () => {
    const result = foldCommissionLines([travelLine(), commissionLine(5_000)])

    expect(result).toHaveLength(1)
    expect(result[0].description).toBe("The Blue Train — Adult")
    expect(result[0].total).toBe(55_000)
    expect(result[0].unit_price).toBe(27_500)
  })

  it("picks the highest-total line when several remain", () => {
    const small = travelLine({ description: "Transfer", qty: 1, unit_price: 1_000, total: 1_000 })
    const large = travelLine({ description: "The Blue Train — Adult", qty: 2, unit_price: 25_000, total: 50_000 })
    const result = foldCommissionLines([small, large, commissionLine(3_000)])

    const folded = result.find((item) => item.description === "The Blue Train — Adult")
    const untouched = result.find((item) => item.description === "Transfer")

    expect(result).toHaveLength(2)
    expect(folded?.total).toBe(53_000)
    expect(untouched?.total).toBe(1_000)
  })

  it("sums multiple commission lines before folding", () => {
    const result = foldCommissionLines([travelLine(), commissionLine(2_000), commissionLine(1_000)])

    expect(result).toHaveLength(1)
    expect(result[0].total).toBe(53_000)
  })

  it("is a no-op when there is no commission line", () => {
    const items = [travelLine()]
    expect(foldCommissionLines(items)).toEqual(items)
  })

  it("leaves commission lines untouched when they are the only lines present", () => {
    const items = [commissionLine(5_000)]
    expect(foldCommissionLines(items)).toEqual(items)
  })

  it("falls back to the commission total as unit price when the target line has no qty", () => {
    const result = foldCommissionLines([
      travelLine({ qty: 0, unit_price: 0, total: 0 }),
      commissionLine(4_000),
    ])

    expect(result[0].total).toBe(4_000)
    expect(result[0].unit_price).toBe(4_000)
  })
})
