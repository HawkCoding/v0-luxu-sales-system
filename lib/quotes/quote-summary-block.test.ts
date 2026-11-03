import { describe, expect, it } from "vitest"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { filterInclusionLines, type SupplierInclusionLine } from "@/lib/inclusions/filter-lines"
import type { BulletLine } from "@/lib/inclusions/bullet-lines"
import { formatMoney } from "@/lib/money"
import { buildPaxGroupPricingRows, buildQuoteSummaryBlock, type QuoteSummaryInput } from "./quote-summary-block"
import { brandedEmailToPlainText } from "@/lib/email/plain-text"
import { allocatePaxGroups } from "@/lib/quotes/pax-group-pricing"
import { blockScopeTagger } from "@/lib/quotes/resolve-pax-group-pricing"
import {
  CARMEN_RATE_LABELS,
  CARMEN_SUBTOTAL,
  carmenQuoteLines,
  carmenServiceBlocks,
} from "@/lib/pax-groups/carmen-sample.fixtures"

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
  it("draws both panels as plain outlined boxes: a one-cell table, the border on its <td>, no fill", () => {
    const html = buildQuoteSummaryBlock({ ...base, subtotal: 91300, agentCommission: 5000 })
    for (const label of ["Quote details", "Total price"]) {
      const panel = html.match(new RegExp(`<table[^>]*data-label="${label}">[\\s\\S]*?</table>`))?.[0] ?? ""
      expect(panel, label).toContain('<td style="padding:14px 16px;border:1px solid #cfc7ba;">')
    }
    expect(html).not.toMatch(/background|bgcolor/)
    for (const legacy of ["#f4f1ee", "#e8e5df", "#fbf8f3", "#f4efe6", "#e8dfd2", "#d8cdbc"]) {
      expect(html).not.toContain(legacy)
    }
  })

  it("spaces the blocks with Outlook-proof spacer rows and <p> margins, never <div>/<hr> margins", () => {
    const html = buildQuoteSummaryBlock({
      ...base,
      itineraryBlocks,
      packageExcludesDefault: "Services not mentioned.",
      subtotal: 91300,
      agentCommission: 5000,
    })
    expect(html).not.toMatch(/<div[^>]*style="[^"]*margin/)
    expect(html).not.toContain("<hr")
    expect(html).toContain(
      '<td height="18" style="height:18px;font-size:18px;line-height:18px;mso-line-height-rule:exactly;border-top:1px solid #cfc7ba;">&nbsp;</td>',
    )
    // The second dated entry carries the gap above it on its own title.
    expect(html.match(/margin:10px 0 2px;/g)?.length).toBe(1)
  })

  it("renders quote meta with travel dates and guests", () => {
    const html = buildQuoteSummaryBlock(base)
    expect(html).toContain("Travel Dates:</strong> 18 – 22 July 2026")
    expect(html).toContain("Guests:</strong> 2 Adults")
  })

  // Every product reads "Travel Dates" -- a hotel-only stay and a rail journey alike.
  it("labels the date line Travel Dates whatever the itinerary holds", () => {
    for (const blocks of [[], [itineraryBlocks[1]], itineraryBlocks]) {
      const html = buildQuoteSummaryBlock({ ...base, itineraryBlocks: blocks })
      expect(html).toContain("Travel Dates:</strong>")
      expect(html).not.toContain("Journey:</strong>")
      expect(html).not.toContain("Stay:</strong>")
    }
  })

  it("prints no COMPLIMENTARY label on a comped hotel", () => {
    const html = buildQuoteSummaryBlock({
      ...base,
      itineraryBlocks: [
        { ...itineraryBlocks[1], serviceData: { ...itineraryBlocks[1].serviceData, isComplimentary: true } },
      ],
    })
    expect(html).not.toMatch(/COMPLIMENTARY/i)
  })

  it("never prints a leg's guest notes", () => {
    const html = buildQuoteSummaryBlock({
      ...base,
      itineraryBlocks: [
        { ...itineraryBlocks[0], serviceData: { ...itineraryBlocks[0].serviceData, notes: "Gluten Free Meals Mrs Adams" } },
      ],
    })
    expect(html).not.toContain("Gluten Free Meals")
  })

  it("prints a hotel's description in italics instead of its facilities", () => {
    const html = buildQuoteSummaryBlock({
      ...base,
      itineraryBlocks: [
        {
          ...itineraryBlocks[1],
          contactDetails: { ...itineraryBlocks[1].contactDetails, description: "A lakeside lodge." },
          serviceData: { ...itineraryBlocks[1].serviceData, inclusions: ["24-hour front desk"] },
        },
      ],
    })
    expect(html).toContain("font-style:italic;line-height:16px;\">A lakeside lodge.</p>")
    expect(html).not.toContain("24-hour front desk")
  })

  it("prints the train arrival caveat in red", () => {
    const html = buildQuoteSummaryBlock({
      ...base,
      itineraryBlocks: [
        { ...itineraryBlocks[0], serviceData: { ...itineraryBlocks[0].serviceData, arrivalDate: "2026-07-22" } },
      ],
    })
    expect(html).toContain("color:#c0392b;font-size:11px;line-height:16px;\">- Train arrival times cannot be guaranteed</p>")
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
    expect(html).toContain("Travel Dates:</strong>")
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
    expect(html).toContain("font-weight:700;line-height:16px;\">Onboard</p>")
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

  it("renders the itinerary section in the salesperson's leg order when blocks exist", () => {
    const html = buildQuoteSummaryBlock({ ...base, itineraryBlocks })
    expect(html).toContain("Your Package Includes")
    expect(html).toContain("18 July 2026")
    expect(html).toContain("Irene Country Lodge")
    // The hotel's check-in date is earlier than the train's, but the train leg is placed first.
    expect(html.indexOf("The Blue Train")).toBeLessThan(html.indexOf("Irene Country Lodge"))
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
    expect(html).toContain("Travel Dates:</strong> To be confirmed")
  })

  it("falls back to a plain TOTAL label when pax is unknown", () => {
    const html = buildQuoteSummaryBlock({ ...base, adults: 0, children: 0 })
    expect(html).toContain("TOTAL:")
    expect(html).not.toContain("Guests:")
    expect(html).not.toContain("per person")
  })

  describe("agent commission", () => {
    it("renders nothing extra when there is no commission — byte-identical to before this field existed", () => {
      const html = buildQuoteSummaryBlock(base)
      expect(html).not.toContain("Subtotal:")
      expect(html).not.toContain("Agent Commission")
    })

    it("renders the subtotal and a red discount row above the total when a commission is set", () => {
      const html = buildQuoteSummaryBlock({ ...base, subtotal: 91300, agentCommission: 5000, total: 86300 })
      expect(html).toContain("Subtotal:")
      expect(html).toContain("Agent Commission: -R")
      expect(html).toContain("#c0392b")
      expect(html).toContain("TOTAL for 2 Adults:")
    })

    it("derives the per-person rate from the gross subtotal, not the discounted total", () => {
      const html = buildQuoteSummaryBlock({ ...base, subtotal: 91300, agentCommission: 5000, total: 86300 })
      // 91300 / 2 adults = 45650 gross per person, not 43150 (86300 / 2).
      expect(html).toContain(formatMoney(45650))
      expect(html).not.toContain(formatMoney(43150))
    })
  })

  describe("discount", () => {
    it("renders the subtotal and a red Discount row when visible", () => {
      const html = buildQuoteSummaryBlock({ ...base, subtotal: 91300, discount: 1300, discountVisible: true, total: 90000 })
      expect(html).toContain("Subtotal:")
      expect(html).toContain("Discount: -R")
      expect(html).toContain("#d64545")
    })

    it("renders nothing extra when discountVisible is false", () => {
      const html = buildQuoteSummaryBlock({ ...base, subtotal: 91300, discount: 1300, discountVisible: false, total: 90000 })
      expect(html).not.toContain("Subtotal:")
      expect(html).not.toContain("Discount")
    })
  })
})

// Rovos-style journey/rate tagged bullets, run through the real filter (lib/inclusions/filter-lines.ts)
// and converted the way lib/voucher/build-service-blocks.ts's resolveInclusionList does (`#` prefix
// for a heading), so this exercises the whole tag -> filter -> raw-list -> render pipeline into the
// {{quoteSummaryTable}} block, not just this file's own rendering of an already-filtered array.
const ROVOS_INCLUSION_LINES: SupplierInclusionLine[] = [
  { kind: "heading", text: "Short Journeys", journeyTag: "short", rateTag: null },
  { kind: "item", text: "Accommodation onboard the train", journeyTag: "short", rateTag: null },
  { kind: "item", text: "Complimentary night pre/post departure", journeyTag: "short", rateTag: "international" },
  { kind: "heading", text: "Long Journeys", journeyTag: "long", rateTag: null },
  { kind: "item", text: "Accommodation onboard the train", journeyTag: "long", rateTag: null },
  { kind: "item", text: "Guided excursions (where applicable)", journeyTag: "long", rateTag: null },
]

function toRawInclusions(lines: BulletLine[]): string[] {
  return lines.map((line) => (line.kind === "heading" ? `# ${line.text}` : line.text))
}

describe("buildQuoteSummaryBlock — Rovos-style journey/rate tagged inclusions", () => {
  it("a short-journey SADC (resident) rate omits the complimentary night", () => {
    const filtered = filterInclusionLines(ROVOS_INCLUSION_LINES, {
      journeyClass: "short",
      rateAudience: "resident",
    })
    const html = buildQuoteSummaryBlock({
      ...base,
      itineraryBlocks: [
        {
          ...itineraryBlocks[0],
          serviceData: { ...itineraryBlocks[0].serviceData, inclusions: toRawInclusions(filtered) },
        },
      ],
    })

    expect(html).toContain("Short Journeys")
    expect(html).not.toContain("Long Journeys")
    expect(html).not.toContain("Complimentary night")
  })

  it("a long-journey international rate shows the long-journey list and the complimentary night is irrelevant to it", () => {
    const filtered = filterInclusionLines(ROVOS_INCLUSION_LINES, {
      journeyClass: "long",
      rateAudience: "international",
    })
    const html = buildQuoteSummaryBlock({
      ...base,
      itineraryBlocks: [
        {
          ...itineraryBlocks[0],
          serviceData: { ...itineraryBlocks[0].serviceData, inclusions: toRawInclusions(filtered) },
        },
      ],
    })

    expect(html).toContain("Long Journeys")
    expect(html).toContain("Guided excursions")
    expect(html).not.toContain("Short Journeys")
    expect(html).not.toContain("Complimentary night")
  })

  it("a short-journey international rate keeps the complimentary night", () => {
    const filtered = filterInclusionLines(ROVOS_INCLUSION_LINES, {
      journeyClass: "short",
      rateAudience: "international",
    })
    const html = buildQuoteSummaryBlock({
      ...base,
      itineraryBlocks: [
        {
          ...itineraryBlocks[0],
          serviceData: { ...itineraryBlocks[0].serviceData, inclusions: toRawInclusions(filtered) },
        },
      ],
    })

    expect(html).toContain("Short Journeys")
    expect(html).toContain("Complimentary night pre/post departure")
  })
})

describe("buildQuoteSummaryBlock pax groups", () => {
  const quoteLines = carmenQuoteLines()
  const pricing = allocatePaxGroups({ lines: quoteLines, target: CARMEN_SUBTOTAL, rateLabels: CARMEN_RATE_LABELS })
  const grouped: QuoteSummaryInput = {
    ...base,
    adults: 8,
    children: 4,
    subtotal: CARMEN_SUBTOTAL,
    discount: 27_240,
    total: 245_160,
    paxGroupPricing: pricing,
    itineraryScopeTag: blockScopeTagger(quoteLines),
    itineraryBlocks: carmenServiceBlocks(),
  }
  /** The "Total price" panel alone. */
  const panel = (html: string) => html.slice(html.indexOf('data-label="Total price"'))
  const text = (html: string) => brandedEmailToPlainText(html).replace(/[  ]/g, " ")

  it("replaces the per-person line with one two-cell row per suite, sentence left and subtotal right", () => {
    const html = panel(buildQuoteSummaryBlock(grouped))

    expect(html).toContain('data-label="Price per suite"')
    expect((html.match(/<tr><td valign="top"/g) ?? []).length).toBe(6)
    expect(html).toMatch(
      /<td valign="top" style="[^"]*text-align:left;[^"]*">Twin Deluxe Suite 2 - 1 Adult x R24.100,00 \(SA\) &amp; 1 Adult x R29.400,00 \(TW\)<\/td><td align="right" valign="top" style="[^"]*text-align:right;[^"]*white-space:nowrap;">R53.500,00<\/td>/,
    )
    expect(html).not.toContain("per person</p>")
  })

  it("keeps the subtotal, discount and total below the suites and reads sentence-then-amount in plain text", () => {
    const plain = text(buildQuoteSummaryBlock(grouped))

    expect(plain).toContain("Twin Deluxe Suite 1 - 2 Adults x R23 800,00 per person (SA) R47 600,00\n")
    expect(plain).toContain("Double Deluxe Suite 6 - 2 Adults x R23 800,00 per person (SA) R47 600,00")
    expect(plain.indexOf("Double Deluxe Suite 6")).toBeLessThan(plain.indexOf("Subtotal: R272 400,00"))
    expect(plain.indexOf("Subtotal: R272 400,00")).toBeLessThan(plain.indexOf("Discount: -R27 240,00"))
    // Carmen's "&" in group mode; a booking without groups keeps "+".
    expect(plain).toContain("TOTAL for 8 Adults & 4 Children: R245 160,00 (incl.VAT)")
    expect(plain).toContain("Guests: 8 Adults & 4 Children")
    const noGroups = text(buildQuoteSummaryBlock({ ...base, adults: 8, children: 4, itineraryBlocks: [] }))
    expect(noGroups).toContain("TOTAL for 8 Adults + 4 Children")
    expect(noGroups).toContain("Guests: 8 Adults + 4 Children")
  })

  it("closes the suites with a rule above the total when nothing is deducted", () => {
    const html = panel(buildQuoteSummaryBlock({ ...grouped, discount: 0, total: CARMEN_SUBTOTAL }))

    expect(html).not.toContain("Subtotal:")
    expect(html.indexOf("Price per suite")).toBeLessThan(html.indexOf("border-bottom:1px solid"))
    expect(html.indexOf("border-bottom:1px solid")).toBeLessThan(html.indexOf("TOTAL for 8 Adults"))
  })

  it("tags a service only some suites take in the itinerary", () => {
    const html = buildQuoteSummaryBlock(grouped)

    expect(html).toContain("Cape Town International Airport (Sedan) at 11h30 (Suite 6 only)")
    expect(html).not.toContain(") (Suite")
  })

  describe("{{paxGroupPricing}} on its own", () => {
    const standalone = buildPaxGroupPricingRows(pricing, "ZAR", { standalone: true })

    it("takes the email's own type instead of the panel's grey 13px", () => {
      expect(standalone).toContain("color:inherit;font-family:inherit;font-size:inherit;line-height:inherit;")
      expect(standalone).not.toContain("color:#554c42")
      expect(standalone).not.toContain("font-size:13px")
    })

    it("closes the rows with a rule and Carmen's TOTAL line, in plain text too", () => {
      expect(standalone.indexOf("Double Deluxe Suite 6")).toBeLessThan(standalone.indexOf("border-bottom:1px solid"))
      expect(standalone).toMatch(/<p style="margin:0;font-weight:700;">TOTAL for 8 Adults &amp; 4 Children: R272.400,00 \(incl\.VAT\)<\/p>$/)
      expect(text(standalone)).toContain("TOTAL for 8 Adults & 4 Children: R272 400,00 (incl.VAT)")
    })

    it("drops the children from the TOTAL line when there are none", () => {
      const adultsOnly = pricing ? { ...pricing, children: 0 } : null
      expect(buildPaxGroupPricingRows(adultsOnly, "ZAR", { standalone: true })).toContain("TOTAL for 8 Adults: ")
    })

    it("leaves the panel's rows without a TOTAL line", () => {
      expect(buildPaxGroupPricingRows(pricing, "ZAR")).not.toContain("TOTAL")
    })
  })

  it("escapes a typed suite name", () => {
    const evil = pricing
      ? { ...pricing, lines: pricing.lines.map((line, index) => (index === 0 ? { ...line, label: "<b>Suite</b>" } : line)) }
      : null
    const html = buildPaxGroupPricingRows(evil, "ZAR")

    expect(html).not.toContain("<b>Suite</b>")
    expect(html).toContain("&lt;b&gt;Suite&lt;/b&gt;")
  })

  it("prints the panel exactly as before without pax-group lines", () => {
    const plainInput: QuoteSummaryInput = { ...base, itineraryBlocks }
    expect(buildQuoteSummaryBlock({ ...plainInput, paxGroupPricing: null, itineraryScopeTag: undefined })).toBe(
      buildQuoteSummaryBlock(plainInput),
    )
    expect(buildPaxGroupPricingRows(null)).toBe("")
    expect(buildPaxGroupPricingRows({ lines: [], adults: 0, children: 0, total: 0 })).toBe("")
  })
})
