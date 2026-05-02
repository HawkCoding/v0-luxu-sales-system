import { describe, expect, it } from "vitest"
import type { EditableSupplierRateCard } from "@/components/package-leg-editor"
import type { SelectablePackageLeg } from "@/components/package-leg-selector"
import {
  formatRange,
  getCurrencyRanges,
  getPackageCurrencyRanges,
} from "@/components/package-wizard-pricing"

function rateCard(
  id: string,
  routeId: string,
  pricePerPerson: number,
  currency = "ZAR",
): EditableSupplierRateCard {
  return {
    id,
    routeId,
    suiteTypeId: "suite-1",
    pricePerPerson,
    childPrice: null,
    infantPrice: null,
    currency,
    validFrom: "2026-01-01",
    validTo: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  }
}

function leg(
  id: string,
  rateCards: EditableSupplierRateCard[],
  selectedRouteIds: string[],
): SelectablePackageLeg {
  return {
    id,
    supplierId: `supplier-${id}`,
    supplierName: `Supplier ${id}`,
    supplierKind: "train_operator",
    label: `Leg ${id}`,
    sortOrder: 0,
    routes: [],
    rateCards,
    suiteTypes: [],
    selectedRouteIds,
  }
}

describe("getCurrencyRanges", () => {
  it("returns an empty array for empty input", () => {
    expect(getCurrencyRanges([], "ZAR")).toEqual([])
  })

  it("sets min and max to the same value for a single rate", () => {
    expect(getCurrencyRanges([rateCard("rate-1", "route-1", 100)], "ZAR")).toEqual([
      { currency: "ZAR", min: 100, max: 100 },
    ])
  })

  it("finds the min and max for multiple rates in the same currency", () => {
    expect(
      getCurrencyRanges(
        [
          rateCard("rate-1", "route-1", 250),
          rateCard("rate-2", "route-1", 100),
          rateCard("rate-3", "route-1", 175),
        ],
        "ZAR",
      ),
    ).toEqual([{ currency: "ZAR", min: 100, max: 250 }])
  })

  it("buckets mixed-case currencies together", () => {
    expect(
      getCurrencyRanges(
        [
          rateCard("rate-1", "route-1", 100, "zar"),
          rateCard("rate-2", "route-1", 150, "ZAR"),
        ],
        "ZAR",
      ),
    ).toEqual([{ currency: "ZAR", min: 100, max: 150 }])
  })

  it("falls back when a rate has an empty currency", () => {
    expect(getCurrencyRanges([rateCard("rate-1", "route-1", 100, "")], "USD")).toEqual([
      { currency: "USD", min: 100, max: 100 },
    ])
  })
})

describe("getPackageCurrencyRanges", () => {
  it("sums the leg minimums and maximums for two legs in the same currency", () => {
    const legs = [
      leg(
        "1",
        [rateCard("rate-1", "route-1", 100), rateCard("rate-2", "route-1", 150)],
        ["route-1"],
      ),
      leg(
        "2",
        [rateCard("rate-3", "route-2", 200), rateCard("rate-4", "route-2", 250)],
        ["route-2"],
      ),
    ]

    expect(getPackageCurrencyRanges(legs, "ZAR")).toEqual([
      { currency: "ZAR", min: 300, max: 400 },
    ])
  })

  it("keeps different currencies in separate package ranges", () => {
    const legs = [
      leg("1", [rateCard("rate-1", "route-1", 100, "ZAR")], ["route-1"]),
      leg("2", [rateCard("rate-2", "route-2", 50, "USD")], ["route-2"]),
    ]

    expect(getPackageCurrencyRanges(legs, "ZAR")).toEqual([
      { currency: "USD", min: 50, max: 50 },
      { currency: "ZAR", min: 100, max: 100 },
    ])
  })

  it("skips legs with no selected rate cards", () => {
    const legs = [
      leg("1", [rateCard("rate-1", "route-1", 100)], ["route-1"]),
      leg("2", [rateCard("rate-2", "route-2", 999)], []),
    ]

    expect(getPackageCurrencyRanges(legs, "ZAR")).toEqual([
      { currency: "ZAR", min: 100, max: 100 },
    ])
  })
})

describe("formatRange", () => {
  it("collapses equal min and max to one amount", () => {
    expect(formatRange({ currency: "ZAR", min: 100, max: 100 })).toBe("ZAR 100")
  })

  it("renders both amounts when min is less than max", () => {
    expect(formatRange({ currency: "ZAR", min: 100, max: 125.5 })).toMatch(
      /^ZAR 100 - ZAR 125[,.]50$/,
    )
  })
})
