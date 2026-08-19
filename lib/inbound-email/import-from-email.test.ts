import fs from "fs"
import path from "path"
import { describe, expect, it } from "vitest"

import { getMessageBody } from "./sync"
import { parseEmailDraft } from "@/lib/import/parseEmailDraft"
import { buildEnquiryImportPayload } from "@/lib/import/enquiry-payload"

/**
 * Drives the exact field-extraction path a live mailbox sync uses -- getMessageBody (scores the
 * text/plain and flattened text/html candidates and picks whichever one the parser can actually
 * read) -> parseEmailDraft -> buildEnquiryImportPayload -- against real Gravity Forms notification
 * emails (anonymised, structure and label wording preserved byte-for-byte). These fixtures are
 * what exposed the bugs this test guards against: normalizeLabel only stripping trailing wrapper
 * punctuation (blue-train-starred-labels.json reproduces the "Unknown Unknown" production
 * failure), a section header glued directly onto the next label with no line break
 * (rovos-rail-glued-headers.json), a bare "I do not require a package" bullet with no preceding
 * label (blue-train-no-package.json), and a text/plain part that a mailbox provider flowed into
 * hard-wrapped paragraphs with an intact HTML table sitting unused in the same message
 * (blue-train-flowed-text-part.json -- the info@sarail.co.za mailbox-switch incident).
 */
interface EmailFixture {
  from: string
  to: string
  subject: string
  text: string
  html: string
  date: string
}

function loadFixture(name: string): EmailFixture {
  const fixturePath = path.join(
    process.cwd(),
    "supabase/seeds/inbound-email-fixtures",
    name,
  )
  return JSON.parse(fs.readFileSync(fixturePath, "utf8")) as EmailFixture
}

describe("inbound email import: blue-train-full-package.json", () => {
  const fixture = loadFixture("blue-train-full-package.json")
  const rawText = getMessageBody(fixture.text, fixture.html).body
  const draft = parseEmailDraft(rawText)
  const payload = buildEnquiryImportPayload(draft)

  it("extracts customer and trip fields from cleanly separated label/value lines", () => {
    expect(draft.customer).toMatchObject({
      title: "Mrs",
      firstName: "Jane",
      surname: "Doe",
      email: "jane.doe@example.com",
      phone: "0821234567",
      country: "South Africa",
      province: "Gauteng",
    })
    expect(draft.trip.route).toBe("Pretoria To Cape Town")
    expect(draft.trip.departureDate).toBe("2026-10-26")
    expect(draft.confidence["trip.departureDate"]).toBe("high")
    expect(draft.guests.adults).toBe(2)
    expect(draft.guests.suites).toBe(1)
    expect(draft.guests.suiteType).toBe("Deluxe Double with 3/4 bath")
  })

  it("extracts package, hotel, and stay-extension fields", () => {
    expect(draft.trip.packageOption).toBe("Overnight Stay")
    expect(draft.trip.hotelOption).toBe("Commodore Hotel - Waterfront")
    expect(draft.trip.hotelPhase).toBe("post")
    expect(draft.trip.extendStay).toBe(false)
  })

  it("carries raw wording into the payload's extractedJson for UI fallback", () => {
    expect(payload.extractedJson.formFields.direction).toBe("Pretoria To Cape Town")
    expect(payload.extractedJson.formFields.hotelPhase).toBe("post")
    expect(payload.hotelPhase).toBe("post")
    expect(payload.extendStay).toBe(false)
  })
})

describe("inbound email import: blue-train-no-package.json", () => {
  const fixture = loadFixture("blue-train-no-package.json")
  const rawText = getMessageBody(fixture.text, fixture.html).body
  const draft = parseEmailDraft(rawText)
  const payload = buildEnquiryImportPayload(draft)

  it("extracts the customer's full given name without a Surname label to split against", () => {
    expect(draft.customer.firstName).toBe("Precious")
    expect(draft.customer.surname).toBe("Nkosi")
  })

  it("recognises a bare 'I do not require a package' bullet with no Package Options label", () => {
    expect(draft.trip.packageOption).toBe("I do not require a package")
  })

  it("extracts the free-text additional services request", () => {
    expect(draft.additionalServices.requested).toBe(true)
    expect(draft.additionalServices.details).toBe("My mother's birthday")
    expect(payload.additionalServices).toBe(true)
    expect(payload.additionalServicesDetails).toBe("My mother's birthday")
  })
})

describe("inbound email import: blue-train-starred-labels.json (regression)", () => {
  const fixture = loadFixture("blue-train-starred-labels.json")
  const rawText = getMessageBody(fixture.text, fixture.html).body
  const draft = parseEmailDraft(rawText)

  it("still extracts every labelled field when labels are wrapped in asterisks", () => {
    // This is the exact shape that produced "Unknown Unknown" with a blank Journey Details card
    // in production: normalizeLabel used to strip wrapper punctuation only from the end of the
    // line, so "*Title*" normalised to "*Title" and matched no label pattern at all.
    expect(draft.customer).toMatchObject({
      title: "Ms",
      firstName: "Precious",
      surname: "Nkosi",
      email: "precious.nkosi@example.com",
      phone: "0837654321",
      country: "South Africa",
      province: "Eastern Cape",
    })
    expect(draft.trip.route).toBe("Pretoria To Cape Town")
    expect(draft.trip.departureDate).toBe("2026-10-19")
    expect(draft.guests.adults).toBe(2)
    expect(draft.guests.suites).toBe(1)
    expect(draft.guests.suiteType).toBe("Deluxe Twin with shower")
    expect(draft.trip.packageOption).toBe("I do not require a package")
    expect(draft.additionalServices.details).toBe("My mother's birthday")
  })
})

describe("inbound email import: rovos-rail-glued-headers.json", () => {
  const fixture = loadFixture("rovos-rail-glued-headers.json")
  const rawText = getMessageBody(fixture.text, fixture.html).body
  const draft = parseEmailDraft(rawText)

  it("splits a label glued directly onto its section header with no line break", () => {
    // The Rovos template emits "Personal Contact InformationTitle" as one line -- no break
    // between the section header and the label that follows it.
    expect(draft.customer.title).toBe("Mr")
    expect(draft.customer.firstName).toBe("Michael")
    expect(draft.customer.surname).toBe("Smit")
    expect(draft.customer.email).toBe("michael.smit@example.com")
    expect(draft.customer.phone).toBe("0839876543")
    expect(draft.customer.country).toBe("South Africa")
  })

  it("recognises the bare 'Package' label this template uses instead of 'Package Options'", () => {
    // "Rovos Rail Departure InformationPackage" -- another glued section header, and the field
    // itself is named "Package" rather than "Package Options" like the Blue Train templates.
    expect(draft.trip.packageOption).toBe("Vic Falls - Train only")
  })

  it("extracts both suites from a two-suite enquiry", () => {
    expect(draft.trip.route).toBe("Victoria Falls To Pretoria")
    expect(draft.guests.adults).toBe(4)
    expect(draft.guests.suites).toBe(2)
    expect(draft.guests.suitePhrases).toEqual([
      "Deluxe Suite - Double bed",
      "Deluxe Suite - Double bed",
    ])
  })
})

describe("inbound email import: rovos-rail-quote-package.json", () => {
  const fixture = loadFixture("rovos-rail-quote-package.json")
  const rawText = getMessageBody(fixture.text, fixture.html).body
  const draft = parseEmailDraft(rawText)
  const payload = buildEnquiryImportPayload(draft)

  it("extracts the trip fields from the Quote template", () => {
    expect(draft.trip.purpose).toBe("quote")
    expect(draft.trip.packageOption).toBe("Cape Town - Train only")
    expect(draft.trip.route).toBe("Pretoria To Cape Town")
    expect(draft.trip.departureDate).toBe("2026-07-24")
    expect(draft.guests.adults).toBe(2)
    expect(draft.guests.suites).toBe(1)
    expect(draft.guests.suitePhrases).toEqual(["Deluxe Suite - Twin beds"])
  })

  it("still reads the services request when its label is glued onto the section header", () => {
    // "Additional Pre and Post Train Travel ServicesWould you like to add additional travel
    // services? (Please specify below)" arrives as one line. This template answers in the field
    // itself rather than a separate explain box, so the answer IS the detail.
    expect(draft.additionalServices.requested).toBe(true)
    expect(draft.additionalServices.details).toBe(
      "Taxi transport from Bela Bela (Warmbaths) on 24.07 2026 to Rovos Rail Pretoria",
    )
    expect(payload.additionalServicesDetails).toBe(
      "Taxi transport from Bela Bela (Warmbaths) on 24.07 2026 to Rovos Rail Pretoria",
    )
  })

  it("leaves hotel fields empty when the template has no hotel section", () => {
    expect(draft.trip.hotelOption).toBe("")
    expect(draft.trip.hotelPhase).toBe("")
  })
})

describe("inbound email import: rovos-rail-availability-hotel.json", () => {
  const fixture = loadFixture("rovos-rail-availability-hotel.json")
  const rawText = getMessageBody(fixture.text, fixture.html).body
  const draft = parseEmailDraft(rawText)
  const payload = buildEnquiryImportPayload(draft)

  it("extracts the trip fields from the Availability template, which has no Package field", () => {
    expect(draft.trip.purpose).toBe("availability")
    expect(draft.trip.packageOption).toBe("")
    expect(draft.trip.route).toBe("Pretoria To Victoria Falls")
    expect(draft.trip.departureDate).toBe("2027-08-11")
    expect(draft.guests.adults).toBe(2)
    expect(draft.guests.suites).toBe(1)
    expect(draft.guests.suitePhrases).toEqual(["Deluxe Double Suite"])
  })

  it("reads the hotel phase from this template's 'Hotel Booking' label", () => {
    // The Blue Train templates label the same field just "Hotel"; reading only that left every
    // Availability enquiry filed as hotel_phase 'none'.
    expect(draft.trip.hotelPhase).toBe("pre")
    expect(payload.hotelPhase).toBe("pre")
    expect(draft.trip.extendStay).toBe(false)
  })

  it("reads the property, not the region code, from a 'Hotel Option: PTY' label", () => {
    // The label carries its own colon; the generic same-line splitter used to answer "PTY".
    expect(draft.trip.hotelOption).toBe("Irene Country Lodge - Pretoria")
    expect(payload.hotelOption).toBe("Irene Country Lodge - Pretoria")
  })

  it("keeps every line of a multi-line travel-services explanation", () => {
    expect(draft.additionalServices.requested).toBe(true)
    expect(draft.additionalServices.details).toBe(
      "Transfer from JNB to Irene Country Lodge on August 10th 2027\n" +
        "Then Transfer from Irene Country Lodge to Rovos Rail on August 11th to Start Rail Journey",
    )
    expect(payload.additionalServices).toBe(true)
  })

  it("does not let the bare Yes flag leak into the detail text, nor the Consent block", () => {
    expect(draft.additionalServices.details).not.toMatch(/^Yes/)
    expect(draft.additionalServices.details).not.toMatch(/Terms and Conditions/)
  })
})

describe("inbound email import: rovos-rail-date-range.json (regression)", () => {
  // Regression fixture for the reported bug: this template states the departure field as a date
  // RANGE ("02 - 13 September 2027", the trip's first and last day) rather than a single date.
  // The parser used to pick up the LAST day in the range (the return date, 13th) instead of the
  // FIRST (the departure, 2nd), so the booking imported a week and a half late.
  const fixture = loadFixture("rovos-rail-date-range.json")
  const rawText = getMessageBody(fixture.text, fixture.html).body
  const draft = parseEmailDraft(rawText)
  const payload = buildEnquiryImportPayload(draft)

  it("reads the FIRST date of the range as the departure date, at high confidence", () => {
    expect(draft.trip.departureDate).toBe("2027-09-02")
    expect(draft.confidence["trip.departureDate"]).toBe("high")
    expect(payload.departureDate).toBe("2027-09-02")
  })

  it("extracts the rest of the trip fields unaffected by the range parsing", () => {
    expect(draft.trip.purpose).toBe("availability")
    expect(draft.guests.adults).toBe(2)
    expect(draft.guests.suites).toBe(1)
    expect(draft.guests.suitePhrases).toEqual(["Pullman Twin Suite"])
    expect(draft.trip.hotelPhase).toBe("pre")
    expect(draft.trip.hotelOption).toBe("Apogee Hotel & Spa - Pretoria")
    expect(draft.trip.extendStay).toBe(false)
    expect(draft.additionalServices.requested).toBe(false)
  })
})

describe("inbound email import: blue-train-flowed-text-part.json (regression)", () => {
  // The production incident this guards against: switching the mailbox from a personal Gmail
  // test account to info@sarail.co.za changed nothing about the Gravity Forms template, but the
  // new mailbox's text/plain alternative arrives hard-wrapped into paragraphs -- no label owns
  // its own line, so every label-driven field came back empty or garbled (job LTT-2026-0034: no
  // first/last name, no country, adults read as 0, the suite phrase became "Adults 2 No of
  // Suites"). The same message's text/html alternative is still the intact Gravity Forms table.
  // getMessageBody must notice the text part scores far fewer required fields and fall back to
  // the flattened HTML instead of trusting text/plain unconditionally.
  const fixture = loadFixture("blue-train-flowed-text-part.json")
  const selection = getMessageBody(fixture.text, fixture.html)
  const draft = parseEmailDraft(selection.body)
  const payload = buildEnquiryImportPayload(draft)

  it("prefers the flattened HTML body over the flowed text/plain part", () => {
    expect(selection.part).toBe("html")
  })

  it("extracts every required field from the HTML fallback", () => {
    expect(draft.customer).toMatchObject({
      title: "Mr",
      firstName: "Thabo",
      surname: "Mokoena",
      email: "thabo.mokoena@example.com",
      phone: "0721234567",
      country: "South Africa",
      province: "Western Cape",
    })
    expect(draft.trip.supplier).toBe("Blue Train")
    expect(draft.trip.route).toBe("Pretoria To Cape Town")
    expect(draft.trip.departureDate).toBe("2026-10-26")
    expect(draft.guests.adults).toBe(2)
    expect(draft.guests.suites).toBe(1)
    expect(draft.guests.suiteType).toBe("Deluxe Double with 3/4 bath")
    expect(payload.extractedJson.formFields.direction).toBe("Pretoria To Cape Town")
  })
})

describe("inbound email import: blue-train-html-only.json", () => {
  // No text/plain alternative at all -- htmlToPlainText is the only path in, on its own (not a
  // fallback the scoring had to choose).
  const fixture = loadFixture("blue-train-html-only.json")
  const selection = getMessageBody(fixture.text, fixture.html)
  const draft = parseEmailDraft(selection.body)

  it("parses the HTML body when no text/plain part exists", () => {
    expect(selection.part).toBe("html")
    expect(draft.customer).toMatchObject({
      title: "Ms",
      firstName: "Lindiwe",
      surname: "Dube",
      email: "lindiwe.dube@example.com",
      country: "South Africa",
    })
    expect(draft.trip.purpose).toBe("availability")
    expect(draft.trip.route).toBe("Cape Town To Pretoria")
    expect(draft.trip.departureDate).toBe("2027-03-14")
  })
})
