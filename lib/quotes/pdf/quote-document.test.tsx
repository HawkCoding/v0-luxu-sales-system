import { describe, expect, it } from "vitest"
import { WARNING_TEXT_COLOR } from "@/lib/quotes/quote-presentation"
import { QuoteDocument } from "./quote-document"
import { sampleQuotePdfData } from "./sample-data"
import type { QuotePdfData } from "./quote-document"

const QUOTE_NUMBER = "LTT-2026-0001-Q1"

function buildDocument(): React.ReactElement<{ title: string; subject: string }> {
  const data: QuotePdfData = {
    ...sampleQuotePdfData(),
    quoteNumber: QUOTE_NUMBER,
    quoteDate: "2026-07-16",
  }
  return QuoteDocument(data) as React.ReactElement<{ title: string; subject: string }>
}

/** Collects every string/number rendered anywhere in the element tree. */
function renderedText(node: unknown, out: string[] = []): string[] {
  if (node == null || typeof node === "boolean") return out
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) renderedText(child, out)
    return out
  }
  const element = node as { props?: { children?: unknown } }
  if (element.props?.children !== undefined) renderedText(element.props.children, out)
  return out
}

/** The props of the first element whose own rendered text is exactly `text`. */
function findTextElement(node: unknown, text: string): { style?: unknown } | null {
  if (node == null || typeof node !== "object") return null
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findTextElement(child, text)
      if (found) return found
    }
    return null
  }
  const element = node as { props?: { children?: unknown; style?: unknown } }
  if (!element.props) return null
  if (renderedText(element.props.children).join("") === text) return element.props
  return findTextElement(element.props.children, text)
}

describe("QuoteDocument", () => {
  it("omits the quote number and quote date while the reference is hidden", () => {
    const text = renderedText(buildDocument()).join(" | ")

    expect(text).not.toContain(QUOTE_NUMBER)
    expect(text).not.toContain("Quote date")
  })

  it("keeps the rest of the document intact without the reference", () => {
    const text = renderedText(buildDocument()).join(" | ")

    expect(text).toContain("Prepared for")
    expect(text).toContain("Travel Dates")
  })

  describe("travel dates label", () => {
    // Mirrors the quote email summary block: every product reads "Travel Dates", never the
    // per-product noun ("Journey"/"Stay"/"Tour").
    it("labels the date line Travel Dates", () => {
      const text = renderedText(buildDocument())

      expect(text).toContain("Travel Dates")
      expect(text).not.toContain("Journey")
      expect(text).not.toContain("Stay")
    })
  })

  describe("prepared for", () => {
    it("prints the client's phone and email under their name", () => {
      const text = renderedText(buildDocument())

      expect(text).toContain("+27 82 555 0100")
      expect(text).toContain("sample.guest@example.com")
    })

    it("omits the contact lines cleanly when neither is known", () => {
      const doc = QuoteDocument({
        ...sampleQuotePdfData(),
        quoteNumber: QUOTE_NUMBER,
        quoteDate: "2026-07-16",
        customerPhone: null,
        customerEmail: "  ",
      }) as React.ReactElement
      const text = renderedText(doc)

      expect(text).not.toContain("+27 82 555 0100")
      expect(text).not.toContain("  ")
    })
  })

  describe("itinerary", () => {
    const blocks: QuotePdfData["itineraryBlocks"] = [
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
        },
        displayOrder: 2,
      },
    ]
    const doc = () =>
      QuoteDocument({
        ...sampleQuotePdfData(),
        quoteNumber: QUOTE_NUMBER,
        quoteDate: "2026-07-16",
        itineraryBlocks: blocks,
      }) as React.ReactElement

    it("prints no COMPLIMENTARY label and no guest notes", () => {
      const text = renderedText(doc()).join(" | ")

      expect(text).not.toMatch(/COMPLIMENTARY/)
      expect(text).not.toContain("Gluten Free Meals Mrs Adams")
    })

    it("prints the train check-in and departure bullets", () => {
      const text = renderedText(doc()).join(" | ")

      expect(text).toContain("- Check in at 10h00")
      expect(text).toContain("- Departure time: 12h00")
      expect(text).not.toContain("Departs at")
    })

    it("prints the hotel description in italics instead of its facilities", () => {
      const description = findTextElement(doc(), "A boutique manor in Pretoria.")

      expect(description?.style).toMatchObject({ fontFamily: "Helvetica-Oblique", fontSize: 8 })
      expect(renderedText(doc()).join(" | ")).not.toContain("24-hour front desk")
    })

    it("prints the train arrival caveat in red", () => {
      const caveat = findTextElement(doc(), "- Train arrival times cannot be guaranteed")

      expect(caveat?.style).toMatchObject({ color: WARNING_TEXT_COLOR })
    })
  })

  it("keeps the quote number out of the PDF viewer's title bar", () => {
    // Document metadata is customer-visible chrome, so it follows the same rule
    // as the page body.
    const doc = buildDocument()

    expect(doc.props.title).toBe("Quotation — Mr & Mrs Sample Guest")
    expect(doc.props.subject).toBe("Quotation")
    expect(doc.props.title).not.toContain(QUOTE_NUMBER)
  })

  describe("agent commission", () => {
    // sampleQuotePdfData ships subtotal: 91300, agentCommission: 5000, discount: 1300,
    // total: 85000 specifically to exercise these rows.
    it("shows the subtotal and the discount above the net total", () => {
      const text = renderedText(buildDocument()).join(" | ")

      expect(text).toContain("Subtotal")
      expect(text).toContain("Agent Commission")
      expect(text).toContain("Discount")
    })

    it("renders nothing extra when there is no commission or discount", () => {
      const doc = QuoteDocument({
        ...sampleQuotePdfData(),
        quoteNumber: QUOTE_NUMBER,
        quoteDate: "2026-07-16",
        subtotal: undefined,
        agentCommission: 0,
        discount: 0,
        total: 85000,
      }) as React.ReactElement
      const text = renderedText(doc).join(" | ")

      expect(text).not.toContain("Subtotal")
      expect(text).not.toContain("Agent Commission")
      expect(text).not.toContain("Discount")
    })
  })

  describe("discount", () => {
    // The PDF only ever renders the `total` it's given — netting the discount out of it is the
    // caller's job (see calculateQuoteTotals). This only checks the row itself stays hidden.
    it("hides the Discount row when discountVisible is false", () => {
      const doc = QuoteDocument({
        ...sampleQuotePdfData(),
        quoteNumber: QUOTE_NUMBER,
        quoteDate: "2026-07-16",
        agentCommission: 0,
        discountVisible: false,
      }) as React.ReactElement
      const text = renderedText(doc).join(" | ")

      expect(text).not.toContain("Discount")
    })
  })
})
