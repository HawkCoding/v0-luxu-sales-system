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

    expect(draft.customer).toMatchObject({
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
      suitePhrases: ["Royal double suite"],
      suiteType: "Royal double suite",
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

  it("infers adults from 'myself and my wife' but never invents a suite count", () => {
    const draft = parseEmailDraft("Please quote Blue Train for myself and my wife.")

    expect(draft.guests.adults).toBe(2)
    expect(draft.confidence["guests.adults"]).toBe("low")
    // An invented suite count manufactures a room nobody asked for; unstated stays 0 and is
    // reported as a missing field instead.
    expect(draft.guests.suites).toBe(0)
    expect(draft.confidence["guests.suites"]).toBeUndefined()
  })

  it("extracts labeled name and surname with high confidence", () => {
    const draft = parseEmailDraft(`
Title: Mr
Name: John
Surname: Smith
Email: john.smith@example.com
`)

    expect(draft.customer.firstName).toBe("John")
    expect(draft.customer.surname).toBe("Smith")
    expect(draft.confidence["customer.firstName"]).toBe("high")
    expect(draft.confidence["customer.surname"]).toBe("high")
  })

  it("extracts a full name from a labeled name field", () => {
    const draft = parseEmailDraft("Name: Jane Doe")

    expect(draft.customer.firstName).toBe("Jane")
    expect(draft.customer.surname).toBe("Doe")
    expect(draft.confidence["customer.firstName"]).toBe("high")
    expect(draft.confidence["customer.surname"]).toBe("high")
  })

  it("extracts passengers as adults with high confidence", () => {
    const draft = parseEmailDraft("Passengers: 2")

    expect(draft.guests.adults).toBe(2)
    expect(draft.confidence["guests.adults"]).toBe("high")
  })

  it("does not read a passenger count across a newline as the suite count", () => {
    const draft = parseEmailDraft(`
Passengers: 2
Suite Type: Deluxe Double Suite
`)

    expect(draft.guests.adults).toBe(2)
    expect(draft.guests.suites).toBe(0)
    expect(draft.confidence["guests.suites"]).toBeUndefined()
    expect(draft.guests.suiteType).toBe("Deluxe Double Suite")
  })

  it("extracts labeled and same-line inline suite counts", () => {
    expect(parseEmailDraft("Number of Suites: 1").guests.suites).toBe(1)
    expect(parseEmailDraft("1 x Deluxe Double Suite").guests.suites).toBe(1)
  })

  it("captures the customer's suite wording verbatim rather than synthesising a name", () => {
    // The old parser emitted composite names ("Deluxe Twin Suite") that exist in no supplier's
    // vocabulary. Matching against real suite_types is the resolver's job (lib/suites/).
    expect(parseEmailDraft("We need a deluxe twin suite for 2 adults.").guests.suiteType).toBe("deluxe twin suite")
    expect(parseEmailDraft("We need a pullman double suite for 2 adults.").guests.suiteType).toBe("pullman double suite")
  })

  it("captures unknown suite wording as-is instead of bucketing it as Other", () => {
    const draft = parseEmailDraft("Suite Type: Harmonic Mountain Suite")

    expect(draft.guests.suitePhrases).toEqual(["Harmonic Mountain Suite"])
    expect(draft.guests.suiteType).toBe("Harmonic Mountain Suite")
  })

  it("parses a Blue Train form email with values on the lines after labels", () => {
    const draft = parseEmailDraft(`
Subject: New submission from Blue Train SA Specials 2026 - Mashike

Please indicate the purpose of your request

Availability
Contact Information
Title

Ms
Name

Mpho
Surname

Mashike
Contact Number

0723093611
Email

mphopmashike@gmail.com
Country

South Africa
Province

Mpumalanga
Blue Train Information
Direction

Pretoria to Cape Town
Departure Date

11 May 2026
No. of Adults

2
No of Suites

1
Suite Type 1

Deluxe Twin with shower
Package Options
Package Options

Five Night Cape Town Package
Hotel Options

PH Breakwater Lodge - Waterfront
Flight Booking

Cape Town to Johannesburg
Flight Departure Date

15/05/2026
Additional Pre and Post Train Travel Services
Acceptance

I have read and accept the Terms and Conditions*
`)

    expect(draft.customer).toEqual({
      title: "Ms",
      firstName: "Mpho",
      surname: "Mashike",
      email: "mphopmashike@gmail.com",
      phone: "0723093611",
      country: "South Africa",
      province: "Mpumalanga",
    })
    expect(draft.trip.supplier).toBe("Blue Train")
    expect(draft.trip.route).toBe("Pretoria To Cape Town")
    expect(draft.trip.departureDate).toBe("2026-05-11")
    expect(draft.trip.purpose).toBe("availability")
    expect(draft.trip.packageOption).toBe("Five Night Cape Town Package")
    expect(draft.trip.hotelOption).toBe("PH Breakwater Lodge - Waterfront")
    expect(draft.trip.flightBooking).toBe("Cape Town to Johannesburg")
    expect(draft.trip.flightDepartureDate).toBe("15/05/2026")
    expect(draft.formFields).toMatchObject({
      country: "South Africa",
      province: "Mpumalanga",
      packageOption: "Five Night Cape Town Package",
      hotelOption: "PH Breakwater Lodge - Waterfront",
      flightBooking: "Cape Town to Johannesburg",
      flightDepartureDate: "15/05/2026",
    })
    expect(draft.guests).toEqual({
      adults: 2,
      children: 0,
      suites: 1,
      suitePhrases: ["Deluxe Twin with shower"],
      suiteType: "Deluxe Twin with shower",
    })
    expect(draft.confidence).toMatchObject({
      "customer.firstName": "high",
      "customer.surname": "high",
      "customer.email": "high",
      "customer.phone": "high",
      "customer.title": "high",
      "customer.country": "high",
      "customer.province": "high",
      "trip.purpose": "high",
      "trip.supplier": "high",
      "trip.route": "high",
      "trip.departureDate": "low",
      "guests.adults": "high",
      "guests.suites": "high",
      "guests.suiteType": "high",
    })
  })

  it("returns empty defaults for empty text", () => {
    const draft = parseEmailDraft("")

    expect(draft.customer.email).toBe("")
    expect(draft.customer.country).toBe("")
    expect(draft.trip.supplier).toBe("")
    expect(draft.trip.route).toBe("")
    expect(draft.trip.departureDate).toBe("")
    expect(draft.guests).toEqual({
      adults: 0,
      children: 0,
      suites: 0,
      suitePhrases: [],
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
Country: South Africa
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
      "Country",
      "Email or Phone (Customer)",
      "Supplier",
      "Route / Direction",
      "Departure date",
      "Adults",
      "Suites",
    ])
  })

  it("accepts phone-only contact information", () => {
    const draft: ParsedDraft = {
      customer: {
        title: "",
        firstName: "John",
        surname: "Smith",
        email: "",
        phone: "+27 82 555 1234",
        country: "South Africa",
        province: "",
      },
      trip: {
        supplier: "Rovos Rail",
        route: "Pretoria To Cape Town",
        departureDate: "2026-05-15",
        purpose: "quote",
        packageOption: "",
        hotelOption: "",
        flightBooking: "",
        flightDepartureDate: "",
      },
      guests: { adults: 2, children: 0, suites: 1, suitePhrases: ["Royal Double Suite"], suiteType: "Royal Double Suite" },
      notes: "",
      formFields: {
        title: "",
        country: "South Africa",
        province: "",
        packageOption: "",
        hotelOption: "",
        flightBooking: "",
        flightDepartureDate: "",
      },
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
Country: South Africa
Regards,
John Smith
`)

    expect(countRequiredComplete(draft)).toEqual({ completed: 9, total: 9 })
  })

  it("returns zero for an empty draft", () => {
    expect(countRequiredComplete(parseEmailDraft(""))).toEqual({ completed: 0, total: 9 })
  })

  it("counts only the fields that are present", () => {
    const draft = parseEmailDraft("Blue Train 2026-05-15 2 adults")

    // Supplier + departure date + adults. No "X to Y" phrasing, so route isn't parsed, and the
    // suite count is no longer invented -- neither counts toward completion until someone states it.
    expect(countRequiredComplete(draft)).toEqual({ completed: 3, total: 9 })
  })

  it("does not require a resolved supplier id by default", () => {
    // Automated inbound imports (lib/inbound-email/review.ts) call this without options and must
    // keep gating on the parsed wording alone -- see ValidateDraftOptions.
    const draft = parseEmailDraft(`
Rovos Rail
Pretoria to Cape Town
2026-05-15
2 adults
1 suite
john@example.com
Country: South Africa
Regards,
John Smith
`)

    expect(draft.trip.supplierId).toBeUndefined()
    expect(validateDraft(draft).missingRequired).not.toContain("Supplier")
    expect(countRequiredComplete(draft)).toEqual({ completed: 9, total: 9 })
  })

  it("requires a resolved supplier id when requireResolvedSupplier is set", () => {
    const draft = parseEmailDraft(`
Rovos Rail
Pretoria to Cape Town
2026-05-15
2 adults
1 suite
john@example.com
Country: South Africa
Regards,
John Smith
`)

    const unresolved = validateDraft(draft, { requireResolvedSupplier: true })
    expect(unresolved.isValid).toBe(false)
    expect(unresolved.missingRequired).toContain("Supplier")
    expect(countRequiredComplete(draft, { requireResolvedSupplier: true }).completed).toBe(8)

    const resolved: ParsedDraft = { ...draft, trip: { ...draft.trip, supplierId: "sup-1" } }
    expect(validateDraft(resolved, { requireResolvedSupplier: true }).missingRequired).not.toContain("Supplier")
    expect(countRequiredComplete(resolved, { requireResolvedSupplier: true }).completed).toBe(9)
  })
})
