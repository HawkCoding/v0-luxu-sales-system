import { describe, expect, it } from "vitest"

import type { PricingSnapshot } from "@/lib/types"
import {
  buildSuiteTokens,
  formatSuitePhrase,
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

    expect(tokens.suiteDescription).toBe("a Twin bedded Deluxe Suite with a shower")
    expect(tokens.suiteType).toBe("Deluxe Suite")
    expect(tokens.suiteConfiguration).toBe("Twin bedded, with a shower")
  })

  it("returns the suite name alone when no options are set", () => {
    const tokens = buildSuiteTokens([{ suiteTypeName: "Deluxe Suite" }])

    expect(tokens.suiteDescription).toBe("a Deluxe Suite")
    expect(tokens.suiteConfiguration).toBe("")
  })

  it("handles bedding only", () => {
    const tokens = buildSuiteTokens([{ suiteTypeName: "Deluxe Suite", bedroomType: "Twin" }])

    expect(tokens.suiteDescription).toBe("a Twin bedded Deluxe Suite")
    expect(tokens.suiteConfiguration).toBe("Twin bedded")
  })

  it("handles bathroom only", () => {
    const tokens = buildSuiteTokens([{ suiteTypeName: "Deluxe Suite", bathroomType: "Bath" }])

    expect(tokens.suiteDescription).toBe("a Deluxe Suite with a bath")
    expect(tokens.suiteConfiguration).toBe("with a bath")
  })

  it("appends the bedroom layout after the bathroom clause", () => {
    const tokens = buildSuiteTokens([{ ...full, bedroomLayout: "Interleading" }])

    expect(tokens.suiteDescription).toBe("a Twin bedded Deluxe Suite with a shower, Interleading")
  })

  it("uses 'an' before a vowel-initial suite name", () => {
    const tokens = buildSuiteTokens([{ suiteTypeName: "Executive Suite" }])

    expect(tokens.suiteDescription).toBe("an Executive Suite")
  })

  it("dedupes identical suites", () => {
    const tokens = buildSuiteTokens([full, { ...full }])

    expect(tokens.suiteDescription).toBe("a Twin bedded Deluxe Suite with a shower")
    expect(tokens.suiteType).toBe("Deluxe Suite")
  })

  it("joins two distinct suites with 'and', each keeping its own article", () => {
    const tokens = buildSuiteTokens([
      full,
      { suiteTypeName: "Royal Suite", bedroomType: "Double", bathroomType: "Bath" },
    ])

    expect(tokens.suiteDescription).toBe(
      "a Twin bedded Deluxe Suite with a shower and a Double bedded Royal Suite with a bath",
    )
    expect(tokens.suiteType).toBe("Deluxe Suite and Royal Suite")
  })

  it("pairs each suite with its own configuration across three suites", () => {
    // The LTT-2026-0035-Q4 case: two Deluxe rooms with different bathrooms plus
    // a Luxury. {{suiteType}} + {{suiteConfiguration}} rendered the unusable
    // cross-product here, which is why the template now uses suiteDescription.
    const tokens = buildSuiteTokens([
      { suiteTypeName: "Deluxe", bedroomType: "Twin", bathroomType: "Shower", supplierKind: "train_operator" },
      { suiteTypeName: "Deluxe", bedroomType: "Twin", bathroomType: "3/4 bath", supplierKind: "train_operator" },
      { suiteTypeName: "Luxury", bedroomType: "Double", bathroomType: "Full bath", supplierKind: "train_operator" },
    ])

    expect(tokens.suiteDescription).toBe(
      "a Twin bedded Deluxe Suite with a shower, " +
        "a Twin bedded Deluxe Suite with a 3/4 bath and " +
        "a Double bedded Luxury Suite with a full bath",
    )
  })

  it("joins three suites with commas and a final 'and'", () => {
    const tokens = buildSuiteTokens([
      { suiteTypeName: "A" },
      { suiteTypeName: "B" },
      { suiteTypeName: "C" },
    ])

    expect(tokens.suiteDescription).toBe("an A, a B and a C")
  })

  it("ignores entries without a suite name", () => {
    const tokens = buildSuiteTokens([{ suiteTypeName: "  ", bedroomType: "Twin" }, full])

    expect(tokens.suiteDescription).toBe("a Twin bedded Deluxe Suite with a shower")
  })

  it("returns empty strings for an empty selection list", () => {
    expect(buildSuiteTokens([])).toEqual({
      suiteType: "",
      suiteConfiguration: "",
      suiteDescription: "",
    })
  })
})

describe("buildSuiteTokens accommodation-leg ranking", () => {
  const train: SuiteSelection = {
    suiteTypeName: "Deluxe",
    bedroomType: "Twin",
    bathroomType: "Shower",
    supplierKind: "train_operator",
  }
  const flight: SuiteSelection = { suiteTypeName: "Economy", supplierKind: "airline" }
  const transfer: SuiteSelection = { suiteTypeName: "Standard - Mazda", supplierKind: "transfers" }
  const hotel: SuiteSelection = { suiteTypeName: "Deluxe", bedroomType: "King", supplierKind: "hotel_property" }

  it("keeps only the train when a job also has flight and transfer legs", () => {
    // LTT-2026-0011-Q1 rendered "a Economy, Deluxe and Standard - Mazda Twin
    // bedded, with a shower" before the ranking existed.
    const tokens = buildSuiteTokens([flight, train, transfer])

    expect(tokens.suiteType).toBe("Deluxe Suite")
    expect(tokens.suiteDescription).toBe("a Twin bedded Deluxe Suite with a shower")
  })

  it("keeps every suite on the winning leg, not just the first", () => {
    const tokens = buildSuiteTokens([
      flight,
      train,
      { ...train, suiteTypeName: "Luxury", bedroomType: "Double", bathroomType: "Full bath" },
    ])

    expect(tokens.suiteDescription).toBe(
      "a Twin bedded Deluxe Suite with a shower and a Double bedded Luxury Suite with a full bath",
    )
  })

  it("falls back to the hotel when there is no train leg", () => {
    const tokens = buildSuiteTokens([transfer, flight, hotel])

    expect(tokens.suiteDescription).toBe("a King bedded Deluxe Room")
  })

  it("still renders a transfer-only job rather than nothing", () => {
    expect(buildSuiteTokens([transfer]).suiteDescription).toBe("a Standard - Mazda Vehicle")
  })

  it("keeps legacy selections that carry no supplier kind", () => {
    const tokens = buildSuiteTokens([{ suiteTypeName: "Deluxe Suite" }, { suiteTypeName: "Royal Suite" }])

    expect(tokens.suiteType).toBe("Deluxe Suite and Royal Suite")
  })

  it("ranks a known kind above selections with no supplier kind", () => {
    const tokens = buildSuiteTokens([{ suiteTypeName: "Mystery Suite" }, train])

    expect(tokens.suiteType).toBe("Deluxe Suite")
  })

  it("leaves a type name that already carries its noun alone", () => {
    const tokens = buildSuiteTokens([{ suiteTypeName: "Deluxe Suite", supplierKind: "train_operator" }])

    expect(tokens.suiteType).toBe("Deluxe Suite")
  })
})

describe("formatSuitePhrase", () => {
  // Shared with lib/voucher/build-service-blocks.ts so the itinerary line composed there uses
  // the exact same grammar as the {{suiteDescription}} token — no article, unlike the token.
  it("builds the full prose, article-free", () => {
    expect(formatSuitePhrase(full)).toBe("Twin bedded Deluxe Suite with a shower")
  })

  it("appends the noun for a type name that doesn't already carry one", () => {
    expect(
      formatSuitePhrase({ suiteTypeName: "Deluxe", bedroomType: "Twin", supplierKind: "train_operator" }),
    ).toBe("Twin bedded Deluxe Suite")
  })

  it("returns an empty string when there is no suite name", () => {
    expect(formatSuitePhrase({ suiteTypeName: "" })).toBe("")
  })

  it("uses the supplier's phrase pattern instead of the default grammar when set", () => {
    expect(
      formatSuitePhrase({
        suiteTypeName: "Deluxe",
        bedroomType: "Double",
        bedroomLayout: "Crosswise",
        supplierKind: "train_operator",
        phrasePattern: "[{bedroom}] [{layout}] {type}",
      }),
    ).toBe("Double Crosswise Deluxe Suite")
  })

  it("falls back to the default grammar when phrasePattern is blank", () => {
    expect(formatSuitePhrase({ ...full, phrasePattern: "" })).toBe(
      "Twin bedded Deluxe Suite with a shower",
    )
    expect(formatSuitePhrase({ ...full, phrasePattern: null })).toBe(
      "Twin bedded Deluxe Suite with a shower",
    )
  })
})

describe("suiteSelectionsFromSnapshots", () => {
  it("reads the chosen variant from each group", () => {
    const selections = suiteSelectionsFromSnapshots([
      snapshot({
        selectedVariants: [
          { label: "Bedroom Type", values: ["Twin"] },
          { label: "Bathroom Type", values: ["Shower"] },
        ],
      }),
    ])

    expect(buildSuiteTokens(selections).suiteDescription).toBe(
      "a Twin bedded Deluxe Suite with a shower",
    )
  })

  it("carries the supplier kind through so ranking can use it", () => {
    const selections = suiteSelectionsFromSnapshots([
      snapshot({ supplierKind: "airline", suiteTypeName: "Economy" }),
      snapshot({ supplierKind: "train_operator" }),
    ])

    expect(selections.map((selection) => selection.supplierKind)).toEqual([
      "airline",
      "train_operator",
    ])
    expect(buildSuiteTokens(selections).suiteType).toBe("Deluxe Suite")
  })

  it("never reads suiteVariants as a selection, even a single-value group", () => {
    // suiteVariants lists every option the suite type offers, not what was chosen — not even
    // when a group happens to hold exactly one value, since that value still wasn't picked.
    const selections = suiteSelectionsFromSnapshots([
      snapshot({
        suiteVariants: [
          { label: "Bedroom Type", values: ["Twin", "Double"] },
          { label: "Bathroom Type", values: ["Shower"] },
        ],
      }),
    ])

    expect(buildSuiteTokens(selections).suiteDescription).toBe("a Deluxe Suite")
  })

  it("skips snapshots without a suite type", () => {
    const selections = suiteSelectionsFromSnapshots([
      null,
      snapshot({ suiteTypeName: null }),
      snapshot({}),
    ])

    expect(selections).toHaveLength(1)
  })

  it("stamps phrasePattern from the supplier id map, live rather than frozen", () => {
    const patterns = new Map([["supplier-1", "[{bedroom}] {type}"]])
    const selections = suiteSelectionsFromSnapshots(
      [snapshot({ supplierId: "supplier-1", suiteTypeName: "Deluxe", supplierKind: "train_operator" })],
      patterns,
    )

    expect(selections[0].phrasePattern).toBe("[{bedroom}] {type}")
  })

  it("leaves phrasePattern null when the supplier id has no entry in the map", () => {
    const patterns = new Map([["some-other-supplier", "{type}"]])
    const selections = suiteSelectionsFromSnapshots([snapshot({ supplierId: "supplier-1" })], patterns)

    expect(selections[0].phrasePattern).toBeNull()
  })

  it("leaves phrasePattern null when the snapshot has no supplier id, even with a pattern map", () => {
    const patterns = new Map([["supplier-1", "{type}"]])
    const selections = suiteSelectionsFromSnapshots([snapshot({ supplierId: null })], patterns)

    expect(selections[0].phrasePattern).toBeNull()
  })
})
