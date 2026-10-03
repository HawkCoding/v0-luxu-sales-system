// @vitest-environment node
// Renders real PDFs: pdf.js text extraction and react-pdf font subsetting both need Node.
import { describe, expect, it } from "vitest"
import { extractPdfPageTexts, extractPdfText } from "@/lib/pdf/extract-text.fixtures"
import { QuoteDocument } from "./quote-document"
import { sampleQuotePdfData } from "./sample-data"
import type { QuotePdfData } from "./quote-document"
import { renderQuotePdf } from "../render-quote-pdf"

const QUOTE_NUMBER = "LTT-2026-0001-Q1"

function data(overrides: Partial<QuotePdfData> = {}): QuotePdfData {
  return {
    ...sampleQuotePdfData(),
    quoteNumber: QUOTE_NUMBER,
    quoteDate: "2026-07-16",
    company: { tel: "+27 12 100 3596", email: "info@sa-rail.co.za", regNumber: "2007/049324/23" },
    ...overrides,
  }
}

/** One whitespace-normalised string per page. */
async function pages(overrides: Partial<QuotePdfData> = {}): Promise<string[]> {
  const buffer = await renderQuotePdf(data(overrides))
  return (await extractPdfPageTexts(buffer)).map((page) => page.replace(/\s+/g, " "))
}

/** One string per printed line (a new baseline starts a new one) — for assertions about wrapping. */
async function lines(overrides: Partial<QuotePdfData> = {}): Promise<string[]> {
  const buffer = await renderQuotePdf(data(overrides))
  return (await extractPdfText(buffer)).split("\n").map((line) => line.trim())
}

interface TextRun {
  str: string
  x: number
  right: number
}

/** Every text run on one page with its left and right edge — for the column assertions the joined
 *  text can't express. */
async function pageRuns(overrides: Partial<QuotePdfData>, pageNumber: number): Promise<TextRun[]> {
  const buffer = await renderQuotePdf(data(overrides))
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const document = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: false }).promise
  const content = await (await document.getPage(pageNumber)).getTextContent()
  return content.items.flatMap((item) =>
    "str" in item ? [{ str: item.str, x: item.transform[4], right: item.transform[4] + item.width }] : [],
  )
}

function runOf(runs: TextRun[], str: string): TextRun {
  const run = runs.find((candidate) => candidate.str === str)
  if (!run) throw new Error(`"${str}" is not a run on this page`)
  return run
}

/** The details page's bullet dots, as the designer placed them (48.5 page edge + 135.8 title column). */
const DETAILS_BULLET_COLUMN_X = 184.3
/** Bullet text, 10.3pt past its dot. */
const DETAILS_BULLET_TEXT_X = 194.6
/** The gap quote-document.tsx keeps (DETAIL_TITLE_GAP) between a title and the bullet column. */
const DETAILS_TITLE_GAP = 10

const itineraryBlocks: QuotePdfData["itineraryBlocks"] = [
  {
    serviceType: "hotel",
    title: "Ivory Manor",
    contactDetails: { name: "Ivory Manor Boutique Hotel", description: "A boutique manor in Pretoria." },
    serviceData: {
      departureDate: "2027-03-15",
      arrivalDate: "2027-03-16",
      startTime: "14:00",
      nights: 1,
      isComplimentary: true,
      inclusions: ["24-hour front desk"],
    },
    displayOrder: 1,
  },
  {
    serviceType: "train",
    title: "Rovos Rail",
    contactDetails: { name: "Rovos Rail" },
    serviceData: {
      departureDate: "2027-03-16",
      arrivalDate: "2027-03-25",
      startTime: "12:00",
      endTime: "10:00",
      arrivalStation: "Pretoria",
      durationDays: 10,
      checkInOffsetMinutes: 120,
      notes: "Gluten Free Meals Mrs Adams",
      inclusions: ["# Onboard:", "All meals"],
    },
    displayOrder: 2,
  },
]

// A real react-pdf render takes a few seconds and overran the 5 s default under a loaded full run.
describe("QuoteDocument", { timeout: 30_000 }, () => {
  it("keeps the quote number out of the document while the reference is hidden", async () => {
    const text = (await pages()).join(" ")

    expect(text).not.toContain(QUOTE_NUMBER)
    expect(text).toContain("Prepared for:")
    expect(text).toContain("16 July 2026")
  })

  it("keeps the quote number out of the PDF viewer's title bar", () => {
    // Document metadata is customer-visible chrome, so it follows the same rule as the page body.
    const doc = QuoteDocument(data()) as React.ReactElement<{ title: string; subject: string }>

    expect(doc.props.title).toBe("Quotation — Mr & Mrs Sample Guest")
    expect(doc.props.subject).toBe("Quotation")
  })

  it("prints the client details and the train journey details", async () => {
    const [first] = await pages()

    expect(first).toContain("Client details:")
    expect(first).toContain("+27 82 555 0100")
    expect(first).toContain("sample.guest@example.com")
    expect(first).not.toContain("Address:")
    expect(first).toContain("Train Journey details:")
    expect(first).toContain("Travel dates:")
    expect(first).toContain("The Blue Train")
    expect(first).toContain("Pretoria to Cape Town")
  })

  it("omits the contact rows cleanly when neither is known", async () => {
    const text = (await pages({ customerPhone: null, customerEmail: "  " })).join(" ")

    expect(text).not.toContain("+27 82 555 0100")
    expect(text).not.toContain("E-mail:")
  })

  it("titles the document in the design's title case", async () => {
    const [first] = await pages({ title: "QUOTATION" })

    expect(first).toContain("Quotation")
    expect(first).not.toContain("QUOTATION")
  })

  describe("itinerary", () => {
    it("prints no COMPLIMENTARY label and no guest notes", async () => {
      const text = (await pages({ itineraryBlocks })).join(" ")

      expect(text).not.toMatch(/COMPLIMENTARY/)
      expect(text).not.toContain("Gluten Free Meals Mrs Adams")
    })

    it("sets each day's short facts on the first page", async () => {
      const [first] = await pages({ itineraryBlocks })

      expect(first).toContain("Check in from 14h00")
      expect(first).toContain("Check in at 10h00 - Train departs at 12h00")
      expect(first).toContain("Arrival at Pretoria station at 10h00 - Train arrival times cannot be guaranteed")
      expect(first).not.toContain("Departure time:")
    })

    it("runs a flight's times on in its sentence, without a ' | '", async () => {
      const [first] = await pages()

      expect(first).toContain("in Economy departing at 10h00 for arrival at 12h15")
      expect(first).not.toContain("Economy |")
    })

    it("heads a train's details with its name and \"Includes:\", not its route", async () => {
      const [, second] = await pages({ itineraryBlocks })

      expect(second).toContain("Rovos Rail Includes:")
    })

    it("starts the package details on a new page, with the hotel description in place of its facilities", async () => {
      const [first, second] = await pages({ itineraryBlocks })

      expect(first).not.toContain("Travel Package Details")
      expect(second).toContain("Travel Package Details:")
      expect(second).toContain("A boutique manor in Pretoria.")
      expect(second).toContain("Onboard:")
      expect(second).toContain("All meals")
      expect(`${first} ${second}`).not.toContain("24-hour front desk")
    })

    it("sets a 26-character hotel name and the excludes heading on one line each", async () => {
      // Wrapped, each would start a line at its first word only ("Ivory Manor" / "Boutique Hotel").
      const printed = await lines({ itineraryBlocks, packageExcludesDefault: "Services not mentioned." })

      expect(printed.some((line) => line.startsWith("Ivory Manor Boutique Hotel"))).toBe(true)
      expect(printed.some((line) => line.startsWith("Your Package Excludes:"))).toBe(true)
    })

    it("keeps the details bullet column where it was, with the one-line titles clear of it", async () => {
      // The product owner's constraint: widening the titles must not push or narrow the descriptions.
      const runs = await pageRuns({ itineraryBlocks, packageExcludesDefault: "Services not mentioned." }, 2)

      for (const bullet of ["A boutique manor in Pretoria.", "Services not mentioned."]) {
        expect(runOf(runs, bullet).x).toBeCloseTo(DETAILS_BULLET_TEXT_X, 1)
      }
      for (const title of ["Ivory Manor Boutique Hotel", "Your Package Excludes:"]) {
        expect(runOf(runs, title).right).toBeLessThanOrEqual(DETAILS_BULLET_COLUMN_X - DETAILS_TITLE_GAP)
      }
    })

    it("still wraps a title too long for its column rather than run it into the bullets", async () => {
      const longName = itineraryBlocks.map((block) =>
        block.serviceType === "hotel"
          ? { ...block, contactDetails: { ...block.contactDetails, name: "Kruger Shalati Train on the Bridge" } }
          : block,
      )
      const printed = await lines({ itineraryBlocks: longName })

      expect(printed.some((line) => line.startsWith("Kruger Shalati Train on the"))).toBe(true)
      expect(printed.some((line) => line.startsWith("Kruger Shalati Train on the Bridge"))).toBe(false)
    })

    it("prints the company footer on the last page only", async () => {
      const [first, second] = await pages({ itineraryBlocks })

      expect(first).not.toContain("©SA Rail")
      expect(second).toContain("©SA Rail 2026")
      expect(second).toContain("RSA Co Reg: 2007/049324/23")
    })
  })

  describe("pricing", () => {
    // sampleQuotePdfData ships subtotal: 91300, agentCommission: 5000, discount: 1300,
    // total: 85000 specifically to exercise these rows.
    it("shows the subtotal and both deductions above the net total", async () => {
      const [first] = await pages()

      expect(first).toContain("Sub Total incl. VAT:")
      expect(first).toContain("Agent Commission:")
      expect(first).toContain("Discount:")
      expect(first).toContain("Total for 2 Adults incl. VAT:")
      // One spelling across the whole box.
      expect(first).not.toContain("incl VAT")
    })

    it("renders only the total when there is no commission or discount", async () => {
      const text = (await pages({ subtotal: undefined, agentCommission: 0, discount: 0, total: 85000 })).join(" ")

      expect(text).not.toContain("Sub Total")
      expect(text).not.toContain("Agent Commission")
      expect(text).not.toContain("Discount")
      expect(text).toContain("Total for 2 Adults incl. VAT")
      expect(text).not.toContain("Total incl VAT:")
    })

    it("names the party in the total label, and prints the per-adult and per-child rows when given", async () => {
      const [first] = await pages({
        adults: 4,
        children: 1,
        perPersonTotals: { perAdult: 60_000, perChild: 25_000 },
      })

      expect(first).toContain("Total for 4 Adults & 1 Child incl. VAT:")
      expect(first).toMatch(/Total per Adult: R\s?60[\s ]?000,00/)
      expect(first).toMatch(/Total per Child: R\s?25[\s ]?000,00/)
    })

    it("keeps the booking's own counts in the Guests row while the total label counts the paying pax", async () => {
      // 2 adults + a 1-year-old: the Guests row still names the infant; the label and rows don't.
      const [first] = await pages({
        adults: 2,
        children: 1,
        payingPax: { adults: 2, children: 0 },
        perPersonTotals: { perAdult: 42_500, perChild: null },
      })

      expect(first).toContain("2 Adults + 1 Child")
      expect(first).toContain("Total for 2 Adults incl. VAT:")
      expect(first).not.toContain("Total per Child")
    })

    it("prints no per-person rows when none can be stated, and no child row on an adults-only booking", async () => {
      const without = (await pages({ perPersonTotals: null })).join(" ")
      expect(without).not.toContain("Total per")

      // The Settings preview sample carries its own adults-only figure.
      expect((await pages()).join(" ")).toMatch(/Total per Adult: R\s?42[\s ]?500,00/)

      const adultsOnly = (await pages({ perPersonTotals: { perAdult: 42_500, perChild: null } })).join(" ")
      expect(adultsOnly).toContain("Total per Adult")
      expect(adultsOnly).not.toContain("Total per Child")
    })

    it("heads the block with the per-person rows, above the Sub Total when a deduction shows", async () => {
      const [first] = await pages()

      expect(first.indexOf("Total per Adult:")).toBeGreaterThanOrEqual(0)
      expect(first.indexOf("Total per Adult:")).toBeLessThan(first.indexOf("Sub Total incl. VAT:"))
      expect(first.indexOf("Sub Total incl. VAT:")).toBeLessThan(first.indexOf("Discount:"))
      expect(first.indexOf("Discount:")).toBeLessThan(first.indexOf("Total for 2 Adults incl. VAT:"))
    })

    it("heads the block with the per-person rows, above the grand total when nothing is deducted", async () => {
      const [first] = await pages({
        adults: 4,
        children: 1,
        subtotal: undefined,
        agentCommission: 0,
        discount: 0,
        perPersonTotals: { perAdult: 60_000, perChild: 25_000 },
      })

      expect(first).not.toContain("Sub Total")
      expect(first.indexOf("Total per Adult:")).toBeGreaterThanOrEqual(0)
      expect(first.indexOf("Total per Adult:")).toBeLessThan(first.indexOf("Total per Child:"))
      expect(first.indexOf("Total per Child:")).toBeLessThan(first.indexOf("Total for 4 Adults & 1 Child incl. VAT:"))
    })

    it("hides the Discount row when discountVisible is false", async () => {
      const text = (await pages({ agentCommission: 0, discountVisible: false })).join(" ")

      expect(text).not.toContain("Discount")
    })
  })
})
