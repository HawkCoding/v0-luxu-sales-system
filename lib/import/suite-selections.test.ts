import { describe, expect, it } from "vitest"

import {
  normalizeDraftSuiteTypes,
  updateDraftSuiteCount,
  type DraftSuiteSelection,
} from "./suite-selections"
import { type ParsedDraft } from "./parseEmailDraft"

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
      flightBooking: "",
      flightDepartureDate: "",
    },
    guests: {
      adults: 2,
      children: 0,
      suites: 1,
      suiteType: "Deluxe Double Suite",
      ...overrides,
    },
    notes: "",
    formFields: { title: "", country: "", province: "", packageOption: "", hotelOption: "", flightBooking: "", flightDepartureDate: "" },
    confidence: {},
    rawText: "",
  }
}

describe("suite selection helpers", () => {
  it("normalizes one legacy parsed suite into one suite row", () => {
    const draft = normalizeDraftSuiteTypes(makeDraft())

    expect(draft.guests.suiteTypes).toEqual(["Deluxe Double Suite"])
    expect(draft.guests.suiteType).toBe("Deluxe Double Suite")
  })

  it("preserves existing selections and appends blanks when increasing suites", () => {
    const draft = updateDraftSuiteCount(makeDraft(), 3)

    expect(draft.guests.suites).toBe(3)
    expect(draft.guests.suiteTypes).toEqual(["Deluxe Double Suite", "", ""])
  })

  it("removes trailing selections when decreasing suites", () => {
    const selections: DraftSuiteSelection[] = [
      { suiteTypeId: "suite-1", suiteTypeName: "Deluxe Double Suite" },
      { suiteTypeId: "suite-2", suiteTypeName: "Luxury Twin Suite" },
      { suiteTypeId: "suite-3", suiteTypeName: "Royal Suite" },
    ]
    const draft = updateDraftSuiteCount(
      makeDraft({ suites: 3, suiteType: "Deluxe Double Suite", suiteSelections: selections }),
      1,
    )

    expect(draft.guests.suiteTypes).toEqual(["Deluxe Double Suite"])
    expect(draft.guests.suiteSelections).toBeUndefined()
  })
})
