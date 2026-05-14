import { describe, expect, it } from "vitest"
import { resolveJobNumberPrefixFromSources } from "@/lib/job-numbering"

describe("resolveJobNumberPrefixFromSources", () => {
  it("maps Blue Train sources to BT", () => {
    expect(resolveJobNumberPrefixFromSources({ supplierName: "Blue Train" })).toMatchObject({
      prefix: "BT",
      needsReview: false,
      reason: "matched_blue_train",
    })
  })

  it("maps Rovos Rail sources to RR", () => {
    expect(resolveJobNumberPrefixFromSources({ rawText: "Please quote Rovos Rail" })).toMatchObject({
      prefix: "RR",
      needsReview: false,
      reason: "matched_rovos_rail",
    })
  })

  it("uses review fallback for unknown products", () => {
    expect(resolveJobNumberPrefixFromSources({ rawText: "Luxury train enquiry" })).toMatchObject({
      prefix: "REV",
      needsReview: true,
      reason: "unknown_train_product",
    })
  })

  it("uses review fallback when both train products are present", () => {
    expect(resolveJobNumberPrefixFromSources({ rawText: "Compare Blue Train and Rovos Rail" })).toMatchObject({
      prefix: "REV",
      needsReview: true,
      reason: "ambiguous_train_product",
    })
  })
})
