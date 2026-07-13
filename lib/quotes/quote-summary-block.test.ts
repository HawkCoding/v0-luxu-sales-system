import { describe, expect, it } from "vitest"
import { buildQuoteSummaryBlock } from "./quote-summary-block"

const base = {
  quoteNumber: "BT-2026-0001-Q1",
  quoteDate: "2026-07-12",
  validUntil: "2026-07-26",
  subtotal: 100,
  vat: 15,
  total: 115,
  lineItems: [
    { description: "Deluxe Suite", supplierDescription: "Rovos Rail", qty: 2, unitPrice: 50, total: 100 },
  ],
}

describe("buildQuoteSummaryBlock", () => {
  it("renders quote meta, line items, and totals", () => {
    const html = buildQuoteSummaryBlock(base)
    expect(html).toContain("BT-2026-0001-Q1")
    expect(html).toContain("Deluxe Suite")
    expect(html).toContain("Rovos Rail")
    expect(html).toContain("Subtotal:")
    expect(html).toContain("Total:")
    // en-ZA currency formatting
    expect(html).toContain("R")
  })

  it("shows Included for zero unit price and em-dash for zero line total", () => {
    const html = buildQuoteSummaryBlock({
      ...base,
      lineItems: [{ description: "Transfer", qty: 1, unitPrice: 0, total: 0 }],
    })
    expect(html).toContain("Included")
    expect(html).toContain("—")
  })

  it("escapes HTML in descriptions", () => {
    const html = buildQuoteSummaryBlock({
      ...base,
      lineItems: [{ description: "<b>bold</b>", qty: 1, unitPrice: 1, total: 1 }],
    })
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;")
    expect(html).not.toContain("<b>bold</b>")
  })

  it("formats missing valid-until as To be confirmed", () => {
    const html = buildQuoteSummaryBlock({ ...base, validUntil: null })
    expect(html).toContain("To be confirmed")
  })
})
