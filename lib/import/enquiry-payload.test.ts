import { describe, expect, it } from "vitest"
import { buildEnquiryImportPayload } from "@/lib/import/enquiry-payload"
import { STAFF_LEAD_SOURCE_OPTIONS, type ParsedDraft } from "@/lib/import/parseEmailDraft"

function draft(overrides: Partial<ParsedDraft> = {}): ParsedDraft {
  return {
    customer: {
      title: "Mr",
      firstName: "QA",
      surname: "Testcase",
      email: "qa@example.com",
      phone: "+27 82 000 0000",
      country: "South Africa",
      province: "Gauteng",
    },
    trip: {
      supplier: "",
      route: "Alpha to Beta",
      departureDate: "2026-09-12",
      purpose: "quote",
      packageOption: "",
      hotelOption: "",
      hotelPhase: "",
      extendStay: null,
      flightBooking: "",
      flightDepartureDate: "",
    },
    guests: { adults: 2, children: 0, childAges: [], suites: 1, suitePhrases: [], suiteType: "" },
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
      direction: "",
      supplier: "",
      departureDateRaw: "",
      suitePhrases: [],
      childAges: [],
      hotelPhase: "",
      extendStay: null,
      additionalServicesDetails: "",
    },
    confidence: {},
    rawText: "",
    ...overrides,
  } as ParsedDraft
}

describe("buildEnquiryImportPayload lead source", () => {
  it("carries the consultant's chosen lead source through to the API body", () => {
    expect(buildEnquiryImportPayload(draft({ source: "phone_call" })).source).toBe("phone_call")
  })

  it("leaves the source unset for a pasted email, so the API records paste_import", () => {
    expect(buildEnquiryImportPayload(draft({ rawText: "Some pasted email" })).source).toBeUndefined()
  })

  it("offers only sources a consultant can legitimately claim", () => {
    // web_form, paste_import and email are decided by the intake path -- offering them here would
    // let a consultant mislabel a booking as a public form submission, which is the reporting bug
    // this selector exists to fix.
    const values = STAFF_LEAD_SOURCE_OPTIONS.map((option) => option.value)

    expect(values).not.toContain("web_form")
    expect(values).not.toContain("paste_import")
    expect(values).not.toContain("email")
    expect(new Set(values).size).toBe(values.length)
  })
})
