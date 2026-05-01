import { describe, expect, it } from "vitest"
import { getEmailImportReviewMetadata } from "@/lib/inbound-email/review"
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
})
