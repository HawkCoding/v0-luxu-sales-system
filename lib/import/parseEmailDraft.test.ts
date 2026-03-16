import { describe, expect, it } from "vitest"

import {
  countRequiredComplete,
  parseEmailDraft,
  validateDraft,
  type ParsedDraft,
} from "./parseEmailDraft"

describe("parseEmailDraft", () => {
  it("extracts a complete well-formed draft with expected confidence", () => {
    const text = `
Hello team,

Please quote Rovos Rail for myself and my wife.
Route: Pretoria to Cape Town
Departure: 2026-05-15
We would like 1 Royal double suite for 2 adults and 1 child.
Contact me on +27 82 555 1234 or john.smith@example.com.

Regards,
John Smith
`

    const draft = parseEmailDraft(text)

    expect(draft.customer).toEqual({
      firstName: "John",
      surname: "Smith",
      email: "john.smith@example.com",
      phone: "+27 82 555 1234",
    })
    expect(draft.trip.supplier).toBe("Rovos Rail")
    expect(draft.trip.route).toBe("Pretoria To Cape Town")
    expect(draft.trip.departureDate).toBe("2026-05-15")
    expect(draft.guests).toEqual({
      adults: 2,
      children: 1,
      suites: 1,
      suiteType: "Royal Double Suite",
    })
    expect(draft.confidence).toMatchObject({
      "customer.email": "high",
      "customer.phone": "high",
      "customer.firstName": "low",
      "customer.surname": "low",
      "trip.supplier": "high",
      "trip.route": "high",
      "trip.departureDate": "high",
      "guests.adults": "high",
      "guests.children": "high",
      "guests.suites": "high",
      "guests.suiteType": "high",
    })
  })

  it("extracts an international phone number", () => {
    const draft = parseEmailDraft("You can reach me on 15551234567 for Blue Train pricing.")

    expect(draft.customer.phone).toBe("15551234567")
    expect(draft.trip.supplier).toBe("Blue Train")
  })

  it("parses all supported routes", () => {
    const cases = [
      ["Pretoria to Cape Town", "Pretoria To Cape Town"],
      ["Cape Town to Pretoria", "Cape Town To Pretoria"],
      ["Pretoria to Victoria Falls", "Pretoria To Victoria Falls"],
      ["Victoria Falls to Pretoria", "Victoria Falls To Pretoria"],
      ["Pretoria to Durban", "Pretoria To Durban"],
      ["Durban to Pretoria", "Durban To Pretoria"],
      ["Pretoria to Swakopmund", "Pretoria To Swakopmund"],
      ["Swakopmund to Pretoria", "Swakopmund To Pretoria"],
      ["Cape Town to Dar es Salaam", "Cape Town To Dar Es Salaam"],
      ["Dar es Salaam to Cape Town", "Dar Es Salaam To Cape Town"],
    ] as const

    for (const [input, expected] of cases) {
      expect(parseEmailDraft(input).trip.route).toBe(expected)
    }
  })

  it("parses written and slash date formats as low confidence", () => {
    const written = parseEmailDraft("Departure date is 15 Mar 2026 on Rovos Rail.")
    const slash = parseEmailDraft("Departure date is 15/03/2026 on Rovos Rail.")

    expect(written.trip.departureDate).toBe("2026-03-15")
    expect(written.confidence["trip.departureDate"]).toBe("low")
    expect(slash.trip.departureDate).toBe("2026-03-15")
    expect(slash.confidence["trip.departureDate"]).toBe("low")
  })

  it("infers adults and default suites for 'myself and my wife'", () => {
    const draft = parseEmailDraft("Please quote Blue Train for myself and my wife.")

    expect(draft.guests.adults).toBe(2)
    expect(draft.guests.suites).toBe(1)
    expect(draft.confidence["guests.adults"]).toBe("low")
    expect(draft.confidence["guests.suites"]).toBe("low")
  })

  it("extracts suite types for deluxe and pullman options", () => {
    expect(parseEmailDraft("We need a deluxe twin suite for 2 adults.").guests.suiteType).toBe("Deluxe Twin Suite")
    expect(parseEmailDraft("We need a pullman double suite for 2 adults.").guests.suiteType).toBe("Pullman Double Suite")
  })

  it("returns empty defaults for empty text", () => {
    const draft = parseEmailDraft("")

    expect(draft.customer.email).toBe("")
    expect(draft.trip.supplier).toBe("")
    expect(draft.trip.route).toBe("")
    expect(draft.trip.departureDate).toBe("")
    expect(draft.guests).toEqual({
      adults: 0,
      children: 0,
      suites: 0,
      suiteType: "",
    })
    expect(draft.confidence).toEqual({})
  })
})

describe("validateDraft", () => {
  it("marks a fully populated draft as valid", () => {
    const draft = parseEmailDraft(`
Rovos Rail
Pretoria to Cape Town
2026-05-15
2 adults
1 suite
john@example.com
Regards,
John Smith
`)

    expect(validateDraft(draft)).toEqual({
      isValid: true,
      missingRequired: [],
      warnings: expect.arrayContaining(["FirstName parsed with low confidence", "Surname parsed with low confidence"]),
    })
  })

  it("reports missing required fields", () => {
    const emptyDraft = parseEmailDraft("")
    const result = validateDraft(emptyDraft)

    expect(result.isValid).toBe(false)
    expect(result.missingRequired).toEqual([
      "First name (Customer)",
      "Surname (Customer)",
      "Email or Phone (Customer)",
      "Supplier",
      "Departure date",
      "Adults",
      "Suites",
    ])
  })

  it("accepts phone-only contact information", () => {
    const draft: ParsedDraft = {
      customer: { firstName: "John", surname: "Smith", email: "", phone: "+27 82 555 1234" },
      trip: { supplier: "Rovos Rail", route: "Pretoria To Cape Town", departureDate: "2026-05-15" },
      guests: { adults: 2, children: 0, suites: 1, suiteType: "Royal Double Suite" },
      notes: "",
      confidence: {},
      rawText: "",
    }

    expect(validateDraft(draft).missingRequired).toEqual([])
  })

  it("adds warnings for low confidence fields", () => {
    const draft = parseEmailDraft("Please quote for myself on 15 Mar 2026. Regards, Jane Doe")
    const result = validateDraft(draft)

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        "FirstName parsed with low confidence",
        "Surname parsed with low confidence",
        "DepartureDate parsed with low confidence",
        "Adults parsed with low confidence",
        "Suites parsed with low confidence",
      ]),
    )
  })
})

describe("countRequiredComplete", () => {
  it("counts all required fields for a complete draft", () => {
    const draft = parseEmailDraft(`
Rovos Rail
Pretoria to Cape Town
2026-05-15
2 adults
1 suite
john@example.com
Regards,
John Smith
`)

    expect(countRequiredComplete(draft)).toEqual({ completed: 7, total: 7 })
  })

  it("returns zero for an empty draft", () => {
    expect(countRequiredComplete(parseEmailDraft(""))).toEqual({ completed: 0, total: 7 })
  })

  it("counts only the fields that are present", () => {
    const draft = parseEmailDraft("Blue Train 2026-05-15 2 adults")

    expect(countRequiredComplete(draft)).toEqual({ completed: 4, total: 7 })
  })
})
