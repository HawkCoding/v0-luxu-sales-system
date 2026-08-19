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
      childAges: [],
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
      childAges: [],
      suites: 1,
      suitePhrases: ["Deluxe Twin with shower"],
      suiteType: "Deluxe Twin with shower",
    })
    expect(draft.termsAccepted).toBe(true)
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
      // Read from the labelled "Departure Date" field, not inferred from prose -- trustworthy
      // regardless of the date format used, unlike a date guessed out of free text.
      "trip.departureDate": "high",
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
      childAges: [],
      suites: 0,
      suitePhrases: [],
      suiteType: "",
    })
    expect(draft.confidence).toEqual({})
    expect(draft.termsAccepted).toBe(true)
  })

  // Seeding notes with the whole email made the review modal's "Additional Notes" box look like it
  // already held the enquiry, and everything typed over it was dropped on save. The email itself
  // lives in rawText, which the modal and the booking's "Original Text" card both render.
  it("leaves notes empty and keeps the full text in rawText", () => {
    const text = "Rovos Rail\nDirection: Pretoria to Cape Town\nName: Jane Doe"
    const draft = parseEmailDraft(text)

    expect(draft.notes).toBe("")
    expect(draft.rawText).toBe(text)
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
        hotelPhase: "",
        extendStay: null,
        flightBooking: "",
        flightDepartureDate: "",
      },
      guests: { adults: 2, children: 0, childAges: [], suites: 1, suitePhrases: ["Royal Double Suite"], suiteType: "Royal Double Suite" },
      additionalServices: { requested: false, details: "" },
      termsAccepted: true,
      notes: "",
      formFields: {
        title: "",
        country: "South Africa",
        province: "",
        packageOption: "",
        hotelOption: "",
        flightBooking: "",
        flightDepartureDate: "",
        direction: "Pretoria To Cape Town",
        supplier: "Rovos Rail",
        departureDateRaw: "2026-05-15",
        suitePhrases: ["Royal Double Suite"],
        childAges: [],
        hotelPhase: "",
        extendStay: null,
        additionalServicesDetails: "",
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

  it("parses the Gravity Forms Blue Train enquiry with children, infants and ages", () => {
    const text = `Please indicate the purpose of your request
  	Quote
Contact Information
Title
  	Mr
Name
  	Gert
Surname
  	Nell
Contact Number
  	0724370842
Email
  	gert_nell@yahoo.com
Country
  	South Africa
Province
  	Western Cape
Blue Train Information
Direction
  	Cape Town to Pretoria
Departure Date
  	06 August 2026
No. of Adults
  	2
No of Infants
  	1
Infant 1: Age
  	5
No of Children
  	1
Child 1: Age
  	6
No of Suites
  	1
Suite Type 1
  	Deluxe Twin with shower


    I do not require a package

Additional Pre and Post Train Travel Services
Acceptance


    I have read and accept the Terms and Conditions*
`

    const draft = parseEmailDraft(text)

    expect(draft.customer).toMatchObject({
      title: "Mr",
      firstName: "Gert",
      surname: "Nell",
      email: "gert_nell@yahoo.com",
      phone: "0724370842",
      country: "South Africa",
      province: "Western Cape",
    })
    expect(draft.trip.supplier).toBe("Blue Train")
    expect(draft.trip.route).toBe("Cape Town To Pretoria")
    expect(draft.trip.departureDate).toBe("2026-08-06")
    // Total minors is the form's children + infants combined -- which of them are actually
    // infants is decided later by age bucket, not by this label.
    expect(draft.guests.adults).toBe(2)
    expect(draft.guests.children).toBe(2)
    expect(draft.guests.childAges).toEqual([5, 6])
    expect(draft.guests.suites).toBe(1)
    expect(draft.guests.suitePhrases).toEqual(["Deluxe Twin with shower"])
    expect(draft.termsAccepted).toBe(true)
  })

  it("reads a 'No' additional-services answer as declined even when the mail client hard-wraps the label", () => {
    // Real Rovos Rail Availability-form notification: the label line is long enough that some
    // mail transports wrap it mid-parenthetical, carrying the closing "etc)*" onto its own line
    // ahead of the actual "No" answer.
    const text = `Please indicate the purpose of your request
  	Availability
Rovos Rail Departure Information
Direction
  	Pretoria to Cape Town
Date: Pretoria to Cape Town
  	11 December 2026
No of Suites
  	1
No. of Adults
  	2
Suite Type 1
  	Deluxe Twin Suite
Additional Pre and Post Train Travel Services
Do you require additional travel services? (e.g flights, tours, transfers,
etc)*
  	No
Consent
  	I have read and accept the Terms and Conditions`

    const draft = parseEmailDraft(text)

    expect(draft.additionalServices).toEqual({ requested: false, details: "" })
    expect(draft.formFields.additionalServicesDetails).toBe("")
  })

  it("still reads a same-line 'No' additional-services answer when the label isn't wrapped", () => {
    const draft = parseEmailDraft(`
Do you require additional travel services? (e.g flights, tours, transfers, etc)*
  	No
`)

    expect(draft.additionalServices).toEqual({ requested: false, details: "" })
  })

  it("keeps the free-text detail when a Quote-form additional-services answer describes the request inline", () => {
    const draft = parseEmailDraft(`
Would you like to add additional travel services? (Please specify below)
Taxi transport from OR Tambo to hotel
`)

    expect(draft.additionalServices).toEqual({
      requested: true,
      details: "Taxi transport from OR Tambo to hotel",
    })
  })

  it("reads Contact Number by label over a stray digit run elsewhere in the body", () => {
    const draft = parseEmailDraft(`
Contact Number
0821234567
Reference: 9998887776655
Country: South Africa
`)

    expect(draft.customer.phone).toBe("0821234567")
  })

  it("falls back to a bare digit scan when no phone label is present", () => {
    const draft = parseEmailDraft("Call me on 0821234567 about Rovos Rail.")

    expect(draft.customer.phone).toBe("0821234567")
  })

  it("counts children from a labelled 'No of Children' field", () => {
    const draft = parseEmailDraft(`
No of Children
2
`)

    expect(draft.guests.children).toBe(2)
    expect(draft.confidence["guests.children"]).toBe("high")
  })

  it("counts infants from a labelled 'No of Infants' field with no children present", () => {
    const draft = parseEmailDraft(`
No of Infants
1
Infant 1: Age
1
`)

    expect(draft.guests.children).toBe(1)
    expect(draft.guests.childAges).toEqual([1])
  })

  it("leaves childAges empty when counts are given without age lines", () => {
    const draft = parseEmailDraft(`
No of Children
2
`)

    expect(draft.guests.children).toBe(2)
    expect(draft.guests.childAges).toEqual([])
  })

  it("reads a same-line indexed age", () => {
    const draft = parseEmailDraft("Child 1: Age: 6")

    expect(draft.guests.childAges).toEqual([6])
  })

  it("marks terms not accepted when the Acceptance block doesn't say accept", () => {
    const draft = parseEmailDraft(`
Acceptance
I decline the Terms and Conditions
`)

    expect(draft.termsAccepted).toBe(false)
  })

  it("defaults terms accepted when no Acceptance block is present at all", () => {
    const draft = parseEmailDraft("Rovos Rail, Pretoria to Cape Town, 2 adults")

    expect(draft.termsAccepted).toBe(true)
  })

  it("reads a Rovos-style glued 'Date: <direction>' label as the departure date, not the direction text", () => {
    // Regression test for the reported bug: Rovos's Gravity Forms notification labels the
    // departure date as "Date: Pretoria to Cape Town" (direction glued into the label) with the
    // actual date on the next line. The generic same-line splitter used to read "Pretoria to Cape
    // Town" as the date value, leaving the real date to be found only via a low-confidence prose
    // scan.
    const draft = parseEmailDraft(`
*Direction*
  Pretoria to Cape Town
*Date: Pretoria to Cape Town*
  25 August 2027
`)

    expect(draft.trip.route).toBe("Pretoria To Cape Town")
    expect(draft.confidence["trip.route"]).toBe("high")
    expect(draft.trip.departureDate).toBe("2027-08-25")
    expect(draft.confidence["trip.departureDate"]).toBe("high")
  })

  it("reads the FIRST date of a Rovos-style date range as the departure date, not the last", () => {
    // Regression test for the reported bug: the Southern Cross Rovos itinerary is stated as a
    // range ("02 - 13 September 2027" -- the trip's first and last day), and the old day-month-year
    // pattern matched whichever day number happened to sit immediately before the month name,
    // which was the RETURN date (13th). The booking then imported as departing on the 13th instead
    // of the 2nd.
    const draft = parseEmailDraft(`
Date: SC - Pretoria to Vic Falls
02 - 13 September 2027
`)

    expect(draft.trip.departureDate).toBe("2027-09-02")
    expect(draft.confidence["trip.departureDate"]).toBe("high")
  })

  it("reads a date range with an en dash and abbreviated month", () => {
    const draft = parseEmailDraft("Departure Date\n02 – 13 Sept 2027")

    expect(draft.trip.departureDate).toBe("2027-09-02")
  })

  it("reads a date range written as '<day> to <day> <month> <year>'", () => {
    const draft = parseEmailDraft("Departure Date\n02 to 13 September 2027")

    expect(draft.trip.departureDate).toBe("2027-09-02")
  })

  it("reads the first date of a range that crosses a month boundary within the same year", () => {
    const draft = parseEmailDraft("Departure Date\n28 September - 03 October 2027")

    expect(draft.trip.departureDate).toBe("2027-09-28")
  })

  it("rolls back to the prior year for a range that crosses New Year's with only the end year stated", () => {
    const draft = parseEmailDraft("Departure Date\n28 December - 05 January 2028")

    expect(draft.trip.departureDate).toBe("2027-12-28")
  })

  it("reads the first date of a range with both endpoints fully dated, month and year on each side", () => {
    const draft = parseEmailDraft("Departure Date\n28 December 2027 - 05 January 2028")

    expect(draft.trip.departureDate).toBe("2027-12-28")
  })

  it("reads a date range found in free prose as low confidence, same as any other inferred date", () => {
    const draft = parseEmailDraft("We're looking at travelling 02 - 13 September 2027 on Rovos Rail.")

    expect(draft.trip.departureDate).toBe("2027-09-02")
    expect(draft.confidence["trip.departureDate"]).toBe("low")
  })

  it("does not let a plain same-line 'Date: <date>' label get shadowed by the glued-label pattern", () => {
    const draft = parseEmailDraft("Date: 2026-05-15")

    expect(draft.trip.departureDate).toBe("2026-05-15")
  })

  it("downgrades an implausibly far-future departure date to low confidence even from a labelled field", () => {
    const draft = parseEmailDraft(`
Departure Date
25 August 2032
`)

    expect(draft.trip.departureDate).toBe("2032-08-25")
    expect(draft.confidence["trip.departureDate"]).toBe("low")
  })

  it("recognises a supplier from a caller-supplied active operator list instead of the hardcoded default", () => {
    const withoutList = parseEmailDraft("Please quote Shongololo Express for our honeymoon.")
    expect(withoutList.trip.supplier).toBe("")

    const withList = parseEmailDraft("Please quote Shongololo Express for our honeymoon.", {
      trainOperatorNames: ["Shongololo Express", "Rovos Rail", "Blue Train"],
    })
    expect(withList.trip.supplier).toBe("Shongololo Express")
    expect(withList.confidence["trip.supplier"]).toBe("high")
  })

  it("resolves a route direction that isn't Pretoria-anchored (generalized, not a hardcoded pair)", () => {
    const draft = parseEmailDraft(`
*Direction*
  Durban to Dar es Salaam
`)

    expect(draft.trip.route).toBe("Durban To Dar Es Salaam")
    expect(draft.confidence["trip.route"]).toBe("high")
  })

  it("matches an operator whose DB name carries a definite article the email omits", () => {
    // Every Blue Train enquiry writes "Blue Train"; the supplier row reads "The Blue Train". An
    // exact scan matched none of them, sending a whole operator's traffic to Needs Review for a
    // supplier the parser could already name.
    const draft = parseEmailDraft("Please send me Blue Train Information for September.", {
      trainOperatorNames: ["The Blue Train", "Rovos Rail"],
    })

    expect(draft.trip.supplier).toBe("The Blue Train")
    expect(draft.confidence["trip.supplier"]).toBe("high")
  })

  it("matches the same operator when the email does write the article", () => {
    const draft = parseEmailDraft("We would like to book The Blue Train.", {
      trainOperatorNames: ["The Blue Train", "Rovos Rail"],
    })

    expect(draft.trip.supplier).toBe("The Blue Train")
  })

  it("prefers an explicit 'from X to Y' over the first bare 'X to Y' in prose", () => {
    // The bare fallback used to take "...would love to do..." and present
    // "Daughter And Would Love To Do The Rovos Rail" as a high-confidence route.
    const draft = parseEmailDraft(
      "We are a couple travelling with their daughter and would love to do the Rovos Rail trip from Pretoria to Cape Town.",
    )

    expect(draft.trip.route).toBe("Pretoria To Cape Town")
  })

  it("returns no route rather than a sentence fragment when nothing looks like a place pair", () => {
    const draft = parseEmailDraft("We would love to do a rail journey next year, please advise.")

    expect(draft.trip.route).toBe("")
    expect(validateDraft(draft).missingRequired).toContain("Route / Direction")
  })

  it("still reads a bare 'X to Y' when both endpoints look like places", () => {
    const draft = parseEmailDraft("Enquiry for Pretoria to Cape Town in May.")

    expect(draft.trip.route).toBe("Pretoria To Cape Town")
    expect(draft.confidence["trip.route"]).toBe("high")
  })

  it("reads 'between X and Y' wording", () => {
    const draft = parseEmailDraft("We want to travel between Pretoria and Victoria Falls.")

    expect(draft.trip.route).toBe("Pretoria To Victoria Falls")
  })
})
