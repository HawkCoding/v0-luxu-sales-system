import { describe, expect, it } from "vitest"
import {
  documentFileName,
  downloadNameForStoredFile,
  sanitizeFileNamePart,
  shortBookingRef,
  stripQuoteVersion,
} from "@/lib/documents/file-names"

describe("shortBookingRef", () => {
  it("drops the prefix from a current 2-digit-year booking number", () => {
    expect(shortBookingRef("LTT-26-0039")).toBe("26-0039")
  })

  it("drops the prefix and shortens the year of a legacy booking number", () => {
    expect(shortBookingRef("LTT-2026-0038")).toBe("26-0038")
  })

  it("keeps a sequence past four digits intact", () => {
    expect(shortBookingRef("LTT-26-10001")).toBe("26-10001")
  })

  it("returns anything that is not a booking number unchanged", () => {
    expect(shortBookingRef("244453")).toBe("244453")
    expect(shortBookingRef("LTT-2026-0001-INV")).toBe("LTT-2026-0001-INV")
    expect(shortBookingRef("LUX-2025-000123")).toBe("LUX-2025-000123")
    expect(shortBookingRef("")).toBe("")
  })
})

describe("documentFileName", () => {
  it("starts with a capital letter and defaults to pdf", () => {
    expect(documentFileName("Quote", "26-0039")).toBe("Quote-26-0039.pdf")
    expect(documentFileName("Invoice", "244453")).toBe("Invoice-244453.pdf")
  })

  it("accepts another extension", () => {
    expect(documentFileName("Report", "revenue", "csv")).toBe("Report-revenue.csv")
  })

  it("sanitizes the reference", () => {
    expect(documentFileName("Invoice", "INV 12/3")).toBe("Invoice-INV_12_3.pdf")
  })
})

describe("sanitizeFileNamePart", () => {
  it("keeps letters, digits, hyphens and underscores", () => {
    expect(sanitizeFileNamePart("LTT-26_0039")).toBe("LTT-26_0039")
    expect(sanitizeFileNamePart("a.b c&d")).toBe("a_b_c_d")
  })
})

describe("stripQuoteVersion", () => {
  it("removes only a trailing -Qn", () => {
    expect(stripQuoteVersion("LTT-26-0039-Q12")).toBe("LTT-26-0039")
    expect(stripQuoteVersion("LTT-26-0039")).toBe("LTT-26-0039")
  })
})

describe("downloadNameForStoredFile", () => {
  it("maps pre-rename lowercase files to the current names", () => {
    expect(downloadNameForStoredFile("LTT-2026-0038-Q1/quote-LTT-2026-0038-Q1.pdf")).toBe("Quote-26-0038.pdf")
    expect(downloadNameForStoredFile("244453/invoice-244453.pdf")).toBe("Invoice-244453.pdf")
    expect(downloadNameForStoredFile("LTT-2026-0038/voucher-LTT-2026-0038.pdf")).toBe("Voucher-26-0038.pdf")
    expect(downloadNameForStoredFile("LTT-2026-0038/itinerary-LTT-2026-0038.pdf")).toBe("Itinerary-26-0038.pdf")
    expect(downloadNameForStoredFile("244453/worksheet-244453.pdf")).toBe("Worksheet-244453.pdf")
  })

  it("passes current names through unchanged", () => {
    expect(downloadNameForStoredFile("LTT-26-0039-Q1/Quote-26-0039.pdf")).toBe("Quote-26-0039.pdf")
    expect(downloadNameForStoredFile("LTT-26-0039/Voucher-26-0039.pdf")).toBe("Voucher-26-0039.pdf")
  })

  it("capitalises an unrecognised name", () => {
    expect(downloadNameForStoredFile("folder/summary.pdf")).toBe("Summary.pdf")
  })
})
