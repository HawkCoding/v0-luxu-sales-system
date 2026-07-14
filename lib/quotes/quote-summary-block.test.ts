import { describe, expect, it } from "vitest"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { buildQuoteSummaryBlock, type QuoteSummaryInput } from "./quote-summary-block"

const itineraryBlocks: VoucherServiceBlock[] = [
  {
    serviceType: "train",
    title: "The Blue Train",
    contactDetails: { name: "The Blue Train" },
    serviceData: {
      departureDate: "2026-07-20",
      route: "Pretoria to Cape Town",
      suiteType: "Deluxe Suite",
      nights: 2,
    },
    displayOrder: 1,
  },
  {
    serviceType: "hotel",
    title: "Irene Country Lodge",
    contactDetails: { name: "Irene Country Lodge" },
    serviceData: {
      departureDate: "2026-07-18",
      roomType: "Guest room with lake view",
      nights: 2,
    },
    displayOrder: 2,
  },
]

const base: QuoteSummaryInput = {
  quoteNumber: "BT-2026-0001-Q1",
  quoteDate: "2026-07-12",
  validUntil: "2026-07-26",
  journeyStart: "2026-07-18",
  journeyEnd: "2026-07-22",
  adults: 2,
  children: 0,
  total: 86300,
  inclusions: [
    { description: "Deluxe Suite", supplierDescription: "Rovos Rail", qty: 2, unit: "night" },
  ],
  itineraryBlocks: [],
}

describe("buildQuoteSummaryBlock", () => {
  it("renders quote meta with journey dates and guests", () => {
    const html = buildQuoteSummaryBlock(base)
    expect(html).toContain("BT-2026-0001-Q1")
    expect(html).toContain("Journey:</strong> 18 – 22 July 2026")
    expect(html).toContain("Guests:</strong> 2 Adults")
  })

  it("renders per-person rate and bold VAT-inclusive total for adults-only bookings", () => {
    const html = buildQuoteSummaryBlock(base)
    expect(html).toContain("2 Adults x")
    expect(html).toContain("per person")
    expect(html).toContain("TOTAL for 2 Adults:")
    expect(html).toContain("(VAT inclusive)")
  })

  it("omits the per-person rate when children are present", () => {
    const html = buildQuoteSummaryBlock({ ...base, children: 1 })
    expect(html).not.toContain("per person")
    expect(html).toContain("TOTAL for 2 Adults + 1 Child:")
  })

  it("does not render item prices or subtotal/VAT rows", () => {
    const html = buildQuoteSummaryBlock(base)
    expect(html).not.toContain("Unit price")
    expect(html).not.toContain("Subtotal:")
    expect(html).not.toContain("VAT:")
    expect(html).toContain("2 × night")
  })

  it("renders the itinerary section chronologically when blocks exist", () => {
    const html = buildQuoteSummaryBlock({ ...base, itineraryBlocks })
    expect(html).toContain("Your Package Includes")
    expect(html).toContain("18 July 2026")
    expect(html).toContain("Irene Country Lodge")
    expect(html.indexOf("Irene Country Lodge")).toBeLessThan(html.indexOf("The Blue Train"))
  })

  it("omits the itinerary section when there are no blocks", () => {
    const html = buildQuoteSummaryBlock(base)
    expect(html).not.toContain("Your Package Includes")
  })

  it("uses a custom includes heading when provided", () => {
    const html = buildQuoteSummaryBlock({
      ...base,
      itineraryBlocks,
      packageIncludesHeading: "What Is Included",
    })
    expect(html).toContain("What Is Included")
    expect(html).not.toContain("Your Package Includes")
  })

  it("escapes HTML in descriptions and block content", () => {
    const html = buildQuoteSummaryBlock({
      ...base,
      inclusions: [{ description: "<b>bold</b>", qty: 1 }],
      itineraryBlocks: [
        {
          ...itineraryBlocks[0],
          title: "<script>alert(1)</script>",
        },
      ],
    })
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;")
    expect(html).not.toContain("<b>bold</b>")
    expect(html).toContain("&lt;script&gt;")
    expect(html).not.toContain("<script>")
  })

  it("formats missing dates as To be confirmed", () => {
    const html = buildQuoteSummaryBlock({
      ...base,
      validUntil: null,
      journeyStart: null,
      journeyEnd: null,
    })
    expect(html).toContain("Valid until:</strong> To be confirmed")
    expect(html).toContain("Journey:</strong> To be confirmed")
  })

  it("falls back to a plain TOTAL label when pax is unknown", () => {
    const html = buildQuoteSummaryBlock({ ...base, adults: 0, children: 0 })
    expect(html).toContain("TOTAL:")
    expect(html).not.toContain("Guests:")
    expect(html).not.toContain("per person")
  })
})
