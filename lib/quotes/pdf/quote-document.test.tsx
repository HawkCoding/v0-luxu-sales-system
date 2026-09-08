import { describe, expect, it } from "vitest"
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

describe("QuoteDocument", () => {
  it("omits the quote number and quote date while the reference is hidden", () => {
    const text = renderedText(buildDocument()).join(" | ")

    expect(text).not.toContain(QUOTE_NUMBER)
    expect(text).not.toContain("Quote date")
  })

  it("keeps the rest of the document intact without the reference", () => {
    const text = renderedText(buildDocument()).join(" | ")

    expect(text).toContain("Prepared for")
    expect(text).toContain("Journey")
  })

  describe("primary product label", () => {
    // No primarySupplierKind supplied (existing callers, e.g. pdf-preview's sample data): the meta
    // line keeps saying "Journey", matching primaryProductOf's null fallback.
    it("labels the meta line Journey when no primary supplier kind is known", () => {
      const doc = QuoteDocument({
        ...sampleQuotePdfData(),
        quoteNumber: QUOTE_NUMBER,
        quoteDate: "2026-07-16",
        primarySupplierKind: null,
      }) as React.ReactElement
      const text = renderedText(doc).join(" | ")

      expect(text).toContain("Journey")
    })

    // Mirrors the quote email summary block (lib/quotes/quote-summary-block.test.ts): a
    // hotel-primary booking is a Stay, so the PDF stapled to that email must read the same.
    it("labels the meta line Stay for a hotel-primary booking", () => {
      const doc = QuoteDocument({
        ...sampleQuotePdfData(),
        quoteNumber: QUOTE_NUMBER,
        quoteDate: "2026-07-16",
        primarySupplierKind: "hotel_property",
      }) as React.ReactElement
      const text = renderedText(doc).join(" | ")

      // Not a negative "Journey" assertion: the default footer/masthead copy
      // ("Luxury Rail Journeys") still says it regardless of the meta label.
      expect(text).toContain("Stay")
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
    // sampleQuotePdfData ships subtotal: 91300, agentCommission: 5000, total: 86300 specifically
    // to exercise this row.
    it("shows the subtotal and the discount above the net total", () => {
      const text = renderedText(buildDocument()).join(" | ")

      expect(text).toContain("Subtotal")
      expect(text).toContain("Agent Commission")
    })

    it("renders nothing extra when there is no commission", () => {
      const doc = QuoteDocument({
        ...sampleQuotePdfData(),
        quoteNumber: QUOTE_NUMBER,
        quoteDate: "2026-07-16",
        subtotal: undefined,
        agentCommission: 0,
        total: 86300,
      }) as React.ReactElement
      const text = renderedText(doc).join(" | ")

      expect(text).not.toContain("Subtotal")
      expect(text).not.toContain("Agent Commission")
    })
  })
})
