import { describe, expect, it } from "vitest"

import {
  applySuiteResolutions,
  getDraftSuiteUnits,
  normalizeDraftSuiteUnits,
  updateDraftSuiteAxisAtIndex,
  updateDraftSuiteCount,
} from "./suite-selections"
import { type ParsedDraft } from "./parseEmailDraft"
import type { SuiteVocabulary } from "@/lib/suites/suite-vocabulary"

function makeDraft(overrides: Partial<ParsedDraft["guests"]> = {}): ParsedDraft {
  return {
    customer: { title: "", firstName: "Jane", surname: "Doe", email: "jane@example.com", phone: "", country: "South Africa", province: "" },
    trip: {
      supplier: "Blue Train",
      route: "Pretoria To Cape Town",
      departureDate: "2026-05-11",
      purpose: "quote",
      packageOption: "",
      hotelOption: "",
      hotelPhase: "",
      extendStay: null,
      flightBooking: "",
      flightDepartureDate: "",
    },
    guests: {
      adults: 2,
      children: 0,
      childAges: [],
      suites: 1,
      suitePhrases: ["Deluxe Twin with shower"],
      suiteType: "Deluxe Twin with shower",
      ...overrides,
    },
    additionalServices: { requested: false, details: "" },
    termsAccepted: true,
    notes: "",
    formFields: {
      title: "",
      country: "",
      province: "",
      packageOption: "",
      hotelOption: "",
      flightBooking: "",
      flightDepartureDate: "",
      direction: "Pretoria To Cape Town",
      supplier: "Blue Train",
      departureDateRaw: "2026-05-11",
      suitePhrases: ["Deluxe Twin with shower"],
      childAges: [],
      hotelPhase: "",
      extendStay: null,
      additionalServicesDetails: "",
    },
    confidence: {},
    rawText: "",
  }
}

function blueTrainVocabulary(): SuiteVocabulary {
  const bedroomTypeIds = new Set(["bt-double", "bt-twin"])
  const bathroomTypeIds = new Set(["ba-shower"])

  return {
    supplierId: "supplier-blue-train",
    suiteTypes: [
      { id: "st-deluxe", name: "Deluxe", bedroomTypeIds, bedroomLayoutIds: new Set(), bathroomTypeIds },
      { id: "st-luxury", name: "Luxury", bedroomTypeIds, bedroomLayoutIds: new Set(), bathroomTypeIds },
    ],
    bedroomTypes: [
      { id: "bt-double", name: "Double" },
      { id: "bt-twin", name: "Twin" },
    ],
    bedroomLayouts: [],
    bathroomTypes: [{ id: "ba-shower", name: "Shower" }],
    aliases: [],
  }
}

describe("getDraftSuiteUnits", () => {
  it("derives blank units carrying the raw wording when nothing is resolved yet", () => {
    const units = getDraftSuiteUnits(makeDraft())

    expect(units).toHaveLength(1)
    expect(units[0].rawPhrase).toBe("Deluxe Twin with shower")
    expect(units[0].suiteTypeId).toBeNull()
  })
})

describe("normalizeDraftSuiteUnits", () => {
  it("sizes the unit list to the suite count", () => {
    const draft = normalizeDraftSuiteUnits(makeDraft())

    expect(draft.guests.suiteUnits).toHaveLength(1)
    expect(draft.guests.suiteUnits?.[0].suiteNumber).toBe(1)
  })
})

describe("updateDraftSuiteCount", () => {
  it("preserves existing units and appends blanks when increasing suites", () => {
    const draft = updateDraftSuiteCount(makeDraft(), 3)

    expect(draft.guests.suites).toBe(3)
    expect(draft.guests.suiteUnits).toHaveLength(3)
    expect(draft.guests.suiteUnits?.[0].rawPhrase).toBe("Deluxe Twin with shower")
    // Padding must not duplicate the first suite's wording -- that would fabricate a request.
    expect(draft.guests.suiteUnits?.[1].rawPhrase).toBe("")
    expect(draft.guests.suiteUnits?.[2].suiteNumber).toBe(3)
  })

  it("removes trailing units when decreasing suites", () => {
    const draft = updateDraftSuiteCount(makeDraft({ suites: 3 }), 1)

    expect(draft.guests.suiteUnits).toHaveLength(1)
  })
})

describe("applySuiteResolutions", () => {
  it("resolves raw wording into ids across all applicable axes", () => {
    const draft = applySuiteResolutions(makeDraft(), blueTrainVocabulary())
    const unit = draft.guests.suiteUnits?.[0]

    expect(unit?.suiteTypeId).toBe("st-deluxe")
    expect(unit?.suiteTypeName).toBe("Deluxe")
    expect(unit?.bedroomTypeId).toBe("bt-twin")
    expect(unit?.bathroomTypeId).toBe("ba-shower")
    expect(unit?.bedroomLayoutId).toBeNull()
  })

  it("leaves unresolvable wording null rather than guessing", () => {
    const draft = applySuiteResolutions(
      makeDraft({ suitePhrases: ["Harmonic Mountain Suite"] }),
      blueTrainVocabulary(),
    )

    expect(draft.guests.suiteUnits?.[0].suiteTypeId).toBeNull()
  })

  it("never overwrites an axis the consultant has already edited", () => {
    const edited = updateDraftSuiteAxisAtIndex(
      normalizeDraftSuiteUnits(makeDraft()),
      0,
      "suiteType",
      "st-luxury",
      "Luxury",
    )

    // Re-resolving (e.g. because the supplier payload reloaded) must not revert the human choice.
    const reResolved = applySuiteResolutions(edited, blueTrainVocabulary())

    expect(reResolved.guests.suiteUnits?.[0].suiteTypeId).toBe("st-luxury")
    expect(reResolved.guests.suiteUnits?.[0].editedAxes).toContain("suiteType")
  })
})

describe("updateDraftSuiteAxisAtIndex", () => {
  it("marks the edited axis so alias learning can tell a correction from an acceptance", () => {
    const draft = updateDraftSuiteAxisAtIndex(
      normalizeDraftSuiteUnits(makeDraft()),
      0,
      "bedroomType",
      "bt-double",
    )

    expect(draft.guests.suiteUnits?.[0].bedroomTypeId).toBe("bt-double")
    expect(draft.guests.suiteUnits?.[0].editedAxes).toEqual(["bedroomType"])
  })

  it("clears the config axes when the suite type changes", () => {
    const resolved = applySuiteResolutions(makeDraft(), blueTrainVocabulary())
    expect(resolved.guests.suiteUnits?.[0].bedroomTypeId).toBe("bt-twin")

    const switched = updateDraftSuiteAxisAtIndex(resolved, 0, "suiteType", "st-luxury", "Luxury")

    // A different suite type may not offer the previous values, so they cannot carry over.
    expect(switched.guests.suiteUnits?.[0].bedroomTypeId).toBeNull()
    expect(switched.guests.suiteUnits?.[0].bathroomTypeId).toBeNull()
  })

  it("ignores an out-of-range suite index", () => {
    const draft = normalizeDraftSuiteUnits(makeDraft())

    expect(updateDraftSuiteAxisAtIndex(draft, 5, "suiteType", "st-deluxe")).toBe(draft)
  })
})
