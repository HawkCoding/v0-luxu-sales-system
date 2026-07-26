import { describe, expect, it } from "vitest"
import { resolveSuitePhrase, resolveSuitePhrases } from "@/lib/suites/resolve-suite-phrase"
import type { SuiteAliasEntry, SuiteVocabulary } from "@/lib/suites/suite-vocabulary"

// Fixtures mirror the real production seed (supabase/seed.sql) so the thresholds are exercised
// against the naming that actually arrives, including its inconsistencies.

const BLUE_TRAIN_IDS = {
  deluxe: "bt-deluxe",
  luxury: "bt-luxury",
  double: "bt-double",
  twin: "bt-twin",
  threeQuarterBath: "bt-3-4-bath",
  fullBath: "bt-full-bath",
  shower: "bt-shower",
}

const ROVOS_IDS = {
  pullmanSuite: "rv-pullman-suite",
  deluxeSuite: "rv-deluxe-suite",
  royalSuite: "rv-royal-suite",
  double: "rv-double",
  twin: "rv-twin",
  crosswise: "rv-crosswise",
  lengthways: "rv-lengthways",
  lShape: "rv-l-shape",
  lengthwaysSplitTwin: "rv-lengthways-split-twin",
  shower: "rv-shower",
  showerAndBath: "rv-shower-and-bath",
}

/** Blue Train: two suite types, Double/Twin bedding, three bathrooms, and NO bedroom layouts. */
function blueTrainVocabulary(aliases: SuiteAliasEntry[] = []): SuiteVocabulary {
  const bedroomTypeIds = new Set([BLUE_TRAIN_IDS.double, BLUE_TRAIN_IDS.twin])
  const bathroomTypeIds = new Set([
    BLUE_TRAIN_IDS.threeQuarterBath,
    BLUE_TRAIN_IDS.fullBath,
    BLUE_TRAIN_IDS.shower,
  ])

  return {
    supplierId: "supplier-blue-train",
    suiteTypes: [
      { id: BLUE_TRAIN_IDS.deluxe, name: "Deluxe", bedroomTypeIds, bedroomLayoutIds: new Set(), bathroomTypeIds },
      { id: BLUE_TRAIN_IDS.luxury, name: "Luxury", bedroomTypeIds, bedroomLayoutIds: new Set(), bathroomTypeIds },
    ],
    bedroomTypes: [
      { id: BLUE_TRAIN_IDS.double, name: "Double" },
      { id: BLUE_TRAIN_IDS.twin, name: "Twin" },
    ],
    bedroomLayouts: [],
    bathroomTypes: [
      { id: BLUE_TRAIN_IDS.threeQuarterBath, name: "3/4 bath" },
      { id: BLUE_TRAIN_IDS.fullBath, name: "Full bath" },
      { id: BLUE_TRAIN_IDS.shower, name: "Shower" },
    ],
    aliases,
  }
}

/** Rovos Rail: three suite types, four layouts, and two overlapping bathroom names. */
function rovosVocabulary(aliases: SuiteAliasEntry[] = []): SuiteVocabulary {
  const bedroomTypeIds = new Set([ROVOS_IDS.double, ROVOS_IDS.twin])
  const bedroomLayoutIds = new Set([
    ROVOS_IDS.crosswise,
    ROVOS_IDS.lengthways,
    ROVOS_IDS.lShape,
    ROVOS_IDS.lengthwaysSplitTwin,
  ])

  return {
    supplierId: "supplier-rovos",
    suiteTypes: [
      {
        id: ROVOS_IDS.pullmanSuite,
        name: "Pullman Suite",
        bedroomTypeIds,
        bedroomLayoutIds,
        // Pullman offers exactly ONE bathroom type -- the no-auto-pick regression case.
        bathroomTypeIds: new Set([ROVOS_IDS.shower]),
      },
      {
        id: ROVOS_IDS.deluxeSuite,
        name: "Deluxe Suite",
        bedroomTypeIds,
        bedroomLayoutIds,
        bathroomTypeIds: new Set([ROVOS_IDS.shower, ROVOS_IDS.showerAndBath]),
      },
      {
        id: ROVOS_IDS.royalSuite,
        name: "Royal Suite",
        bedroomTypeIds,
        bedroomLayoutIds,
        bathroomTypeIds: new Set([ROVOS_IDS.shower, ROVOS_IDS.showerAndBath]),
      },
    ],
    bedroomTypes: [
      { id: ROVOS_IDS.double, name: "Double" },
      { id: ROVOS_IDS.twin, name: "Twin" },
    ],
    bedroomLayouts: [
      { id: ROVOS_IDS.crosswise, name: "Crosswise" },
      { id: ROVOS_IDS.lengthways, name: "Lengthways" },
      { id: ROVOS_IDS.lShape, name: "L-Shape" },
      { id: ROVOS_IDS.lengthwaysSplitTwin, name: "Lengthways Split Twin" },
    ],
    bathroomTypes: [
      { id: ROVOS_IDS.shower, name: "Shower" },
      { id: ROVOS_IDS.showerAndBath, name: "Shower and Bath" },
    ],
    aliases,
  }
}

describe("resolveSuitePhrase", () => {
  it('resolves "Deluxe Twin with shower" against Blue Train across all applicable axes', () => {
    const result = resolveSuitePhrase("Deluxe Twin with shower", blueTrainVocabulary())

    expect(result.suiteTypeId).toBe(BLUE_TRAIN_IDS.deluxe)
    expect(result.bedroomTypeId).toBe(BLUE_TRAIN_IDS.twin)
    expect(result.bathroomTypeId).toBe(BLUE_TRAIN_IDS.shower)
    expect(result.source).toBe("exact")
    expect(result.axes.suiteType.score).toBeCloseTo(1)
  })

  it("marks an axis the suite type has no vocab for as notApplicable, not unresolved", () => {
    const result = resolveSuitePhrase("Deluxe Twin with shower", blueTrainVocabulary())

    // Blue Train has zero bedroom_layouts rows -- null is correct here, and must never be
    // reported as a gap or it becomes a permanent un-clearable warning on every enquiry.
    expect(result.bedroomLayoutId).toBeNull()
    expect(result.axes.bedroomLayout.notApplicable).toBe(true)
    expect(result.unresolvedAxes).not.toContain("bedroomLayout")
  })

  it('resolves "Pullman Double Suite" against Rovos, weighting the generic "suite" token down', () => {
    const result = resolveSuitePhrase("Pullman Double Suite", rovosVocabulary())

    expect(result.suiteTypeId).toBe(ROVOS_IDS.pullmanSuite)
    expect(result.bedroomTypeId).toBe(ROVOS_IDS.double)
    expect(result.source).toBe("exact")
  })

  it("never auto-picks a lone option: silence about bathrooms stays null even when only one is allowed", () => {
    const result = resolveSuitePhrase("Pullman Double Suite", rovosVocabulary())

    // Rovos "Pullman Suite" allows exactly one bathroom type (Shower), but the phrase says
    // nothing about bathrooms. Guessing here is the bug this whole feature exists to remove.
    expect(result.bathroomTypeId).toBeNull()
    expect(result.axes.bathroomType.notApplicable).toBe(false)
    expect(result.unresolvedAxes).toContain("bathroomType")
  })

  it("resolves nothing when the phrase belongs to a different supplier's vocabulary", () => {
    const result = resolveSuitePhrase("Pullman Double Suite", blueTrainVocabulary())

    expect(result.suiteTypeId).toBeNull()
    expect(result.bedroomTypeId).toBeNull()
    expect(result.source).toBe("none")
  })

  it("resolves nothing for wholly unknown wording rather than falling back to a placeholder", () => {
    const result = resolveSuitePhrase("Harmonic Mountain Suite", rovosVocabulary())

    expect(result.suiteTypeId).toBeNull()
    expect(result.bedroomTypeId).toBeNull()
    expect(result.bedroomLayoutId).toBeNull()
    expect(result.bathroomTypeId).toBeNull()
  })

  it("fuzzy-matches a misspelled suite type and reports it as fuzzy", () => {
    const result = resolveSuitePhrase("De Luxe Twin Suite", blueTrainVocabulary())

    expect(result.suiteTypeId).toBe(BLUE_TRAIN_IDS.deluxe)
    expect(result.source).toBe("fuzzy")
    expect(result.axes.suiteType.score).toBeLessThan(1)
  })

  it("refuses to guess between two equally plausible suite types and returns both as candidates", () => {
    const ambiguous: SuiteVocabulary = {
      supplierId: "supplier-ambiguous",
      suiteTypes: [
        {
          id: "amb-twin",
          name: "Deluxe Twin",
          bedroomTypeIds: new Set(),
          bedroomLayoutIds: new Set(),
          bathroomTypeIds: new Set(),
        },
        {
          id: "amb-double",
          name: "Deluxe Double",
          bedroomTypeIds: new Set(),
          bedroomLayoutIds: new Set(),
          bathroomTypeIds: new Set(),
        },
      ],
      bedroomTypes: [],
      bedroomLayouts: [],
      bathroomTypes: [],
      aliases: [],
    }

    const result = resolveSuitePhrase("Deluxe", ambiguous)

    expect(result.suiteTypeId).toBeNull()
    expect(result.axes.suiteType.candidates.map((candidate) => candidate.id).sort()).toEqual([
      "amb-double",
      "amb-twin",
    ])
  })

  it("scores each axis independently so a shared token cannot leak across axes", () => {
    const result = resolveSuitePhrase("Pullman Twin Suite", rovosVocabulary())

    expect(result.bedroomTypeId).toBe(ROVOS_IDS.twin)
    // "Lengthways Split Twin" also contains "twin", but covers only one of its three tokens.
    expect(result.bedroomLayoutId).toBeNull()
  })

  it("prefers the more specific of two fully-covered candidates instead of stalling on the tie", () => {
    const result = resolveSuitePhrase("Deluxe Suite with shower and bath", rovosVocabulary())

    expect(result.suiteTypeId).toBe(ROVOS_IDS.deluxeSuite)
    // "Shower" is fully covered too, but it is a strict token-subset of "Shower and Bath",
    // so it is a less specific version of the same answer -- not a competing interpretation.
    expect(result.bathroomTypeId).toBe(ROVOS_IDS.showerAndBath)
  })

  it("fills from a learned alias where scoring finds nothing", () => {
    const aliases: SuiteAliasEntry[] = [
      { axis: "suiteType", phrase: "coupe for two", targetId: ROVOS_IDS.pullmanSuite, status: "confirmed" },
    ]

    const withoutAlias = resolveSuitePhrase("Coupé for two", rovosVocabulary())
    expect(withoutAlias.suiteTypeId).toBeNull()

    const withAlias = resolveSuitePhrase("Coupé for two", rovosVocabulary(aliases))
    expect(withAlias.suiteTypeId).toBe(ROVOS_IDS.pullmanSuite)
    expect(withAlias.source).toBe("alias")
    expect(withAlias.axes.suiteType.score).toBe(1)
  })

  it("matches aliases on exact normalized phrase only, never fuzzily", () => {
    const aliases: SuiteAliasEntry[] = [
      {
        axis: "suiteType",
        phrase: "deluxe twin with shower",
        targetId: ROVOS_IDS.royalSuite,
        status: "confirmed",
      },
    ]

    // Near-miss wording ("showers") must NOT hit the alias -- otherwise one learned row could
    // spread across neighbouring phrasings.
    const result = resolveSuitePhrase("Deluxe Twin with showers", rovosVocabulary(aliases))

    expect(result.suiteTypeId).not.toBe(ROVOS_IDS.royalSuite)
    expect(result.source).not.toBe("alias")
  })

  it("resolves config axes to null when the suite type itself is unresolved", () => {
    // Without a suite type there is nothing to validate a config value against, so filling one
    // would produce a combination findInvalidVariantField would reject server-side anyway.
    const result = resolveSuitePhrase("twin with shower", rovosVocabulary())

    expect(result.suiteTypeId).toBeNull()
    expect(result.bedroomTypeId).toBeNull()
    expect(result.bathroomTypeId).toBeNull()
    expect(result.axes.bedroomType.candidates).toEqual([])
  })

  it("returns an all-null resolution for blank wording", () => {
    const result = resolveSuitePhrase("   ", rovosVocabulary())

    expect(result.normalizedPhrase).toBe("")
    expect(result.suiteTypeId).toBeNull()
    expect(result.source).toBe("none")
    expect(result.unresolvedAxes).toEqual([])
  })

  it("reports phrase tokens that no axis consumed", () => {
    const result = resolveSuitePhrase("Deluxe Twin with shower and a butler", blueTrainVocabulary())

    expect(result.unusedTokens).toContain("butler")
    expect(result.unusedTokens).not.toContain("deluxe")
  })
})

describe("resolveSuitePhrases", () => {
  it("resolves each phrase independently, preserving order", () => {
    const results = resolveSuitePhrases(
      ["Pullman Double Suite", "Royal Twin Suite"],
      rovosVocabulary(),
    )

    expect(results).toHaveLength(2)
    expect(results[0].suiteTypeId).toBe(ROVOS_IDS.pullmanSuite)
    expect(results[0].bedroomTypeId).toBe(ROVOS_IDS.double)
    expect(results[1].suiteTypeId).toBe(ROVOS_IDS.royalSuite)
    expect(results[1].bedroomTypeId).toBe(ROVOS_IDS.twin)
  })
})
