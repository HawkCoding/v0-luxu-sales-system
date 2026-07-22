import { describe, expect, it } from "vitest"

import type { PricingSnapshot } from "@/lib/types"
import {
  buildSuiteTokens,
  suiteSelectionsFromSnapshots,
  type SuiteSelection,
} from "@/lib/templates/suite-description"

function snapshot(overrides: Partial<PricingSnapshot>): PricingSnapshot {
  return {
    source: "pricing_engine",
    pricingMode: "rate_card",
    packageId: "pkg-1",
    packageName: "Package",
    legId: "leg-1",
    legLabel: null,
    supplierId: null,
    supplierName: null,
    supplierKind: null,
    routeId: null,
    routeName: null,
    suiteTypeId: "suite-1",
    suiteTypeName: "Deluxe Suite",
    rateCardId: null,
    travelDate: "2026-09-14",
    passengerKind: "adult",
    baseUnitPrice: 100,
    markupPct: 0,
    singleSupplementPct: null,
    serviceType: null,
    ...overrides,
  }
}

const full: SuiteSelection = {
  suiteTypeName: "Deluxe Suite",
  bedroomType: "Twin",
  bathroomType: "Shower",
}

describe("buildSuiteTokens", () => {
  it("builds the prose line from suite, bedding and bathroom", () => {
    const tokens = buildSuiteTokens([full])

    expect(tokens.suiteDescription).toBe("Twin bedded Deluxe Suite with a shower")
    expect(tokens.suiteType).toBe("Deluxe Suite")
    expect(tokens.suiteConfiguration).toBe("Twin bedded, with a shower")
  })

  it("returns the suite name alone when no options are set", () => {
    const tokens = buildSuiteTokens([{ suiteTypeName: "Deluxe Suite" }])

    expect(tokens.suiteDescription).toBe("Deluxe Suite")
    expect(tokens.suiteConfiguration).toBe("")
  })

  it("handles bedding only", () => {
    const tokens = buildSuiteTokens([{ suiteTypeName: "Deluxe Suite", bedroomType: "Twin" }])

    expect(tokens.suiteDescription).toBe("Twin bedded Deluxe Suite")
    expect(tokens.suiteConfiguration).toBe("Twin bedded")
  })

  it("handles bathroom only", () => {
    const tokens = buildSuiteTokens([{ suiteTypeName: "Deluxe Suite", bathroomType: "Bath" }])

    expect(tokens.suiteDescription).toBe("Deluxe Suite with a bath")
    expect(tokens.suiteConfiguration).toBe("with a bath")
  })

  it("appends the bedroom layout after the bathroom clause", () => {
    const tokens = buildSuiteTokens([{ ...full, bedroomLayout: "Interleading" }])

    expect(tokens.suiteDescription).toBe("Twin bedded Deluxe Suite with a shower, Interleading")
  })

  it("dedupes identical suites", () => {
    const tokens = buildSuiteTokens([full, { ...full }])

    expect(tokens.suiteDescription).toBe("Twin bedded Deluxe Suite with a shower")
    expect(tokens.suiteType).toBe("Deluxe Suite")
  })

  it("joins two distinct suites with 'and'", () => {
    const tokens = buildSuiteTokens([
      full,
      { suiteTypeName: "Royal Suite", bedroomType: "Double", bathroomType: "Bath" },
    ])

    expect(tokens.suiteDescription).toBe(
      "Twin bedded Deluxe Suite with a shower and Double bedded Royal Suite with a bath",
    )
    expect(tokens.suiteType).toBe("Deluxe Suite and Royal Suite")
  })

  it("joins three suites with commas and a final 'and'", () => {
    const tokens = buildSuiteTokens([
      { suiteTypeName: "A" },
      { suiteTypeName: "B" },
      { suiteTypeName: "C" },
    ])

    expect(tokens.suiteDescription).toBe("A, B and C")
  })

  it("ignores entries without a suite name", () => {
    const tokens = buildSuiteTokens([{ suiteTypeName: "  ", bedroomType: "Twin" }, full])

    expect(tokens.suiteDescription).toBe("Twin bedded Deluxe Suite with a shower")
  })

  it("returns empty strings for an empty selection list", () => {
    expect(buildSuiteTokens([])).toEqual({
      suiteType: "",
      suiteConfiguration: "",
      suiteDescription: "",
    })
  })
})

describe("suiteSelectionsFromSnapshots", () => {
  it("reads the chosen variant from each group", () => {
    const selections = suiteSelectionsFromSnapshots([
      snapshot({
        suiteVariants: [
          { label: "Bedroom Type", values: ["Twin"] },
          { label: "Bathroom Type", values: ["Shower"] },
        ],
      }),
    ])

    expect(buildSuiteTokens(selections).suiteDescription).toBe(
      "Twin bedded Deluxe Suite with a shower",
    )
  })

  it("ignores a group listing every option the suite type offers", () => {
    // The fallback path in build-from-package.ts populates suiteVariants with
    // all available options, which says nothing about what was chosen.
    const selections = suiteSelectionsFromSnapshots([
      snapshot({
        suiteVariants: [
          { label: "Bedroom Type", values: ["Twin", "Double"] },
          { label: "Bathroom Type", values: ["Shower"] },
        ],
      }),
    ])

    expect(buildSuiteTokens(selections).suiteDescription).toBe("Deluxe Suite with a shower")
  })

  it("skips snapshots without a suite type", () => {
    const selections = suiteSelectionsFromSnapshots([
      null,
      snapshot({ suiteTypeName: null }),
      snapshot({}),
    ])

    expect(selections).toHaveLength(1)
  })
})
