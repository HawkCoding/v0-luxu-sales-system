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
  quoteNumber: "LTT-2026-0001-Q1",
  quoteDate: "2026-07-12",
  validUntil: "2026-07-26",
  journeyStart: "2026-07-18",
  journeyEnd: "2026-07-22",
  adults: 2,
  children: 0,
  total: 86300,
  itineraryBlocks: [],
}

describe("buildQuoteSummaryBlock", () => {
  it("renders quote meta with journey dates and guests", () => {
    const html = buildQuoteSummaryBlock(base)
    expect(html).toContain("Journey:</strong> 18 – 22 July 2026")
    expect(html).toContain("Guests:</strong> 2 Adults")
  })

  it("omits the quote number and quote date while the reference is hidden", () => {
    // Salespeople never reference either, so they are noise to the customer.
    // QUOTE_REFERENCE_ENABLED is false; flipping it restores both lines.
    const html = buildQuoteSummaryBlock(base)
    expect(html).not.toContain("Quote number:")
    expect(html).not.toContain("Quote date:")
    expect(html).not.toContain("LTT-2026-0001-Q1")
  })

  it("still renders the details box when the quote reference is hidden", () => {
    const html = buildQuoteSummaryBlock(base)
    expect(html).toContain('data-label="Quote details"')
    expect(html).toContain("Journey:</strong>")
  })

  it("renders per-person rate and bold VAT-inclusive total for adults-only bookings", () => {
    const html = buildQuoteSummaryBlock(base)
    expect(html).toContain("2 Adults x")
    expect(html).toContain("per person")
    expect(html).toContain("TOTAL for 2 Adults:")
    expect(html).toContain("(incl.VAT)")
  })

  it("omits the per-person rate when children are present", () => {
    const html = buildQuoteSummaryBlock({ ...base, children: 1 })
    expect(html).not.toContain("per person")
    expect(html).toContain("TOTAL for 2 Adults + 1 Child:")
  })

  describe("currency", () => {
    it("defaults to the base currency", () => {
      expect(buildQuoteSummaryBlock(base)).toContain("R")
    })

    it("renders a foreign-currency quote in its own currency", () => {
      const html = buildQuoteSummaryBlock({ ...base, total: 5000, currency: "USD" })
      expect(html).toContain("$")
      // The client sees one currency only: a converted USD quote must not also show rand.
      expect(html).not.toMatch(/R\s?5\s?000/)
    })

    it("never emits a doubled currency symbol", () => {
      // Two migrations exist purely to strip a literal "R" typed in front of a token that
      // already carried one (20260810120000_fix_double_rand_templates_all_rows.sql).
      const html = buildQuoteSummaryBlock({ ...base, currency: "USD" })
      expect(html).not.toContain("R$")
      expect(html).not.toContain("$$")
    })
  })

  it("prints a `#` inclusion as a bold undashed subheading, its items still dashed", () => {
    const html = buildQuoteSummaryBlock({
      ...base,
      itineraryBlocks: [
        {
          ...itineraryBlocks[0],
          serviceData: {
            ...itineraryBlocks[0].serviceData,
            inclusions: ["# Onboard", "High Tea"],
          },
        },
      ],
    })
    expect(html).toContain("font-weight:700;line-height:17px;\">Onboard</p>")
    expect(html).not.toContain("- Onboard")
    expect(html).not.toContain("# Onboard")
    expect(html).toContain(">- High Tea</p>")
  })

  it("does not render item prices, subtotal/VAT rows, or the inclusions table", () => {
    const html = buildQuoteSummaryBlock(base)
    expect(html).not.toContain("Unit price")
    expect(html).not.toContain("Subtotal:")
    expect(html).not.toContain("VAT:")
    expect(html).not.toContain("Your quotation includes")
  })

  it("does not render the valid-until line while validity is hidden", () => {
    const html = buildQuoteSummaryBlock(base)
    expect(html).not.toContain("Valid until")
  })

  it("renders the total price block after the itinerary and exclusions", () => {
    const html = buildQuoteSummaryBlock({
      ...base,
      itineraryBlocks,
      packageExcludesDefault: "Services not mentioned.",
    })
    const totalIndex = html.indexOf("TOTAL for 2 Adults:")
    expect(totalIndex).toBeGreaterThan(html.indexOf("Your Package Includes"))
    expect(totalIndex).toBeGreaterThan(html.indexOf("Your Package Excludes"))
  })

  it("labels each generated section for the send-dialog editor", () => {
    const html = buildQuoteSummaryBlock({
      ...base,
      itineraryBlocks,
      packageExcludesDefault: "Services not mentioned.",
    })
    expect(html).toContain('data-label="Quote details"')
    expect(html).toContain('data-label="Your Package Includes"')
    expect(html).toContain('data-label="Your Package Excludes"')
    expect(html).toContain('data-label="Total price"')
    expect(html).toContain('data-label="Divider line"')
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

  it("escapes HTML in block content", () => {
    const html = buildQuoteSummaryBlock({
      ...base,
      itineraryBlocks: [
        {
          ...itineraryBlocks[0],
          contactDetails: { name: "<script>alert(1)</script>" },
          serviceData: {
            ...itineraryBlocks[0].serviceData,
            inclusions: ["<img src=x onerror=alert(1)>"],
          },
        },
      ],
      packageExcludesDefault: "<i>excluded</i>",
    })
    expect(html).toContain("&lt;script&gt;")
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;")
    expect(html).not.toContain("<img src=x")
    expect(html).toContain("&lt;i&gt;excluded&lt;/i&gt;")
  })

  it("formats missing dates as To be confirmed", () => {
    const html = buildQuoteSummaryBlock({
      ...base,
      validUntil: null,
      journeyStart: null,
      journeyEnd: null,
    })
    expect(html).toContain("Journey:</strong> To be confirmed")
  })

  it("falls back to a plain TOTAL label when pax is unknown", () => {
    const html = buildQuoteSummaryBlock({ ...base, adults: 0, children: 0 })
    expect(html).toContain("TOTAL:")
    expect(html).not.toContain("Guests:")
    expect(html).not.toContain("per person")
  })
})
