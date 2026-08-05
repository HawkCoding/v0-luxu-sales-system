import fs from "fs"
import path from "path"
import { describe, expect, it } from "vitest"

import { getMessageBody } from "./sync"
import { parseEmailDraft } from "@/lib/import/parseEmailDraft"
import { buildEnquiryImportPayload } from "@/lib/import/enquiry-payload"

/**
 * Drives the exact field-extraction path a live mailbox sync uses -- getMessageBody (picks the
 * text part IMAP delivered) -> parseEmailDraft -> buildEnquiryImportPayload -- against real
 * Gravity Forms notification emails (anonymised, structure and label wording preserved byte-for-
 * byte). These fixtures are what exposed the bugs this test guards against: normalizeLabel only
 * stripping trailing wrapper punctuation (blue-train-starred-labels.json reproduces the
 * "Unknown Unknown" production failure), a section header glued directly onto the next label with
 * no line break (rovos-rail-glued-headers.json), and a bare "I do not require a package" bullet
 * with no preceding label (blue-train-no-package.json).
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
  const rawText = getMessageBody(fixture.text, fixture.html)
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
  const rawText = getMessageBody(fixture.text, fixture.html)
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
  const rawText = getMessageBody(fixture.text, fixture.html)
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
  const rawText = getMessageBody(fixture.text, fixture.html)
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
