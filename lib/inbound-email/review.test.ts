import { describe, expect, it } from "vitest"
import { assessEnquiryPlausibility, getEmailImportReviewMetadata } from "@/lib/inbound-email/review"
import { parseEmailDraft } from "@/lib/import/parseEmailDraft"

describe("email import review metadata", () => {
  it("marks missing required fields as needs review", () => {
    const draft = parseEmailDraft("Email: client@example.com\nRovos Rail")
    const review = getEmailImportReviewMetadata(draft)

    expect(review.needsReview).toBe(true)
    expect(review.missingFields).toContain("First name (Customer)")
  })

  it("keeps complete high-confidence imports out of review", () => {
    const draft = parseEmailDraft(`
Title: Ms
First name: Jane
Surname: Smith
Email: jane@example.com
Country: South Africa
Please indicate the purpose of your request: Quote
Rovos Rail
Pretoria to Cape Town
Departure Date: 2026-05-15
No. of Adults: 2
No. of Suites: 1
Suite Type: Pullman Twin Suite
`)
    const review = getEmailImportReviewMetadata(draft)

    expect(review.needsReview).toBe(false)
    expect(review.missingFields).toEqual([])
  })

  it("does not flag a resolvable supplier as missing just because it has no id yet", () => {
    // Regression guard: the automated importer (lib/inbound-email/import-booking.ts) resolves
    // trip.supplier to a real id *after* this review metadata is computed, and never writes it
    // back onto the draft. If validateDraft ever started requiring draft.trip.supplierId here by
    // default, every inbound email would incorrectly flip to needs-review.
    const draft = parseEmailDraft(`
Title: Ms
First name: Jane
Surname: Smith
Email: jane@example.com
Country: South Africa
Rovos Rail
Pretoria to Cape Town
Departure Date: 2026-05-15
No. of Adults: 2
No. of Suites: 1
`)
    expect(draft.trip.supplierId).toBeUndefined()

    const review = getEmailImportReviewMetadata(draft)

    expect(review.needsReview).toBe(false)
    expect(review.missingFields).not.toContain("Supplier")
  })

  it("does not flag review for a complete draft that only has a low-confidence field", () => {
    // A departure date read from prose ("15 Mar 2026" rather than a labelled form field) parses
    // at low confidence, but it's still a real, usable date -- on its own that must not force
    // every otherwise-complete enquiry into the Needs Review queue.
    const draft = parseEmailDraft(`
Title: Ms
First name: Jane
Surname: Smith
Email: jane@example.com
Country: South Africa
Rovos Rail
Pretoria to Cape Town
Please quote for travel on 15 Mar 2026.
No. of Adults: 2
No. of Suites: 1
`)
    expect(draft.confidence["trip.departureDate"]).toBe("low")

    const review = getEmailImportReviewMetadata(draft)

    expect(review.needsReview).toBe(false)
    expect(review.warnings).toContain("DepartureDate parsed with low confidence")
  })
})

describe("assessEnquiryPlausibility", () => {
  it("rejects an out-of-office auto-reply", () => {
    // This exact body produced a customer, a booking LTT-2026-0057 and a draft quote, because the
    // subject rule was the only content gate the automated path had.
    const draft = parseEmailDraft(`
Thank you for your email. I am currently out of the office until 20 August
and will respond on my return.

For urgent matters contact reception@example.com.

Regards,
Sarah Jones
`)

    const verdict = assessEnquiryPlausibility(draft)

    expect(verdict.importable).toBe(false)
    expect(verdict.reason).toContain("does not look like an enquiry")
  })

  it("rejects an email with a contactable human but no trip detail at all", () => {
    const draft = parseEmailDraft(`
First name: Jane
Surname: Smith
Email: jane@example.com
Country: South Africa
No. of Adults: 2
No. of Suites: 1
Please add me to your mailing list.
`)

    const verdict = assessEnquiryPlausibility(draft)

    expect(verdict.importable).toBe(false)
    expect(verdict.reason).toContain("No supplier, route or departure date")
  })

  it("accepts a half-filled enquiry — that is what Needs Review is for", () => {
    const draft = parseEmailDraft(`
First name: Jane
Surname: Smith
Email: jane@example.com
Country: South Africa
Rovos Rail
Departure Date: 2026-09-15
`)

    const verdict = assessEnquiryPlausibility(draft)

    expect(verdict.importable).toBe(true)
    // Still flagged — importable and complete are different bars.
    expect(getEmailImportReviewMetadata(draft).needsReview).toBe(true)
  })

  it("accepts a complete enquiry", () => {
    const draft = parseEmailDraft(`
First name: Jane
Surname: Smith
Email: jane@example.com
Country: South Africa
Rovos Rail
Direction: Pretoria to Cape Town
Departure Date: 2026-09-15
No. of Adults: 2
No. of Suites: 1
`)

    expect(assessEnquiryPlausibility(draft).importable).toBe(true)
  })
})
