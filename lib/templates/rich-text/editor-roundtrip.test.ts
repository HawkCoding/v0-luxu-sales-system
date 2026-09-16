// The test that actually proves the design: the pure serialize functions alone
// don't prove ProseMirror didn't eat something on the way through, so drive a
// real headless Editor and assert fromEditorHtml(editor.getHTML()) === source.

import { describe, it, expect } from "vitest"
import { Editor } from "@tiptap/react"
import { buildEditorExtensions } from "@/lib/templates/rich-text/editor-extensions"
import { toEditorHtml, fromEditorHtml, normalizeForCompare } from "@/lib/templates/rich-text/serialize"
import { DEFAULT_TEMPLATES } from "@/lib/templates/get-template"
import { buildQuoteSummaryBlock } from "@/lib/quotes/quote-summary-block"
import { buildBankingDetailsBlock } from "@/lib/invoices/banking-details-block"

const BLOCK_TOKENS = ["quoteSummaryTable", "bankingDetails", "guestInfo"]

function roundTripThroughEditor(source: string, blockTokens: string[]): string {
  const editor = new Editor({
    extensions: buildEditorExtensions(),
    content: toEditorHtml(source, blockTokens).html,
  })
  const out = fromEditorHtml(editor.getHTML())
  editor.destroy()
  return out
}

describe("editor round-trip", () => {
  it("preserves all 8 default template bodies", () => {
    for (const [key, tpl] of Object.entries(DEFAULT_TEMPLATES)) {
      const result = roundTripThroughEditor(tpl.bodyHtml, BLOCK_TOKENS)
      expect(normalizeForCompare(result), `template ${key}`).toBe(normalizeForCompare(tpl.bodyHtml))
    }
  })

  it("preserves a real quote summary table spliced between paragraphs (constraint 1)", () => {
    const table = buildQuoteSummaryBlock({
      quoteNumber: "BT-2026-0001-Q1",
      quoteDate: "2026-07-12",
      validUntil: "2026-07-26",
      journeyStart: "2026-07-18",
      journeyEnd: "2026-07-22",
      adults: 2,
      children: 0,
      total: 58900,
      itineraryBlocks: [
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
      ],
    })
    const source = `<p>Dear Sofia,</p>${table}<p>Kind regards,<br/>Luxus Travel &amp; Tours</p>`
    const result = roundTripThroughEditor(source, BLOCK_TOKENS)
    expect(normalizeForCompare(result)).toBe(normalizeForCompare(source))
  })

  it("preserves an inline font-size span combined with bold", () => {
    // Nesting order (textStyle outside bold) and the trailing ";" match the
    // editor's own canonical output, so content it already produced is
    // stable on reopen rather than reshuffling marks on every save.
    const source =
      '<p>Hi <span style="font-size: 24px;">big</span> and ' +
      '<span style="font-size: 12px;"><strong>{{amountDue}}</strong></span>.</p>'
    const result = roundTripThroughEditor(source, BLOCK_TOKENS)
    expect(normalizeForCompare(result)).toBe(normalizeForCompare(source))
  })

  it("preserves a span combining font size, text color, and highlight", () => {
    // The DOM canonicalizes color/background-color to rgb(r, g, b) once
    // touched by the editor (confirmed empirically) — this is the exact
    // shape real saved content has on reopen, so it's what's authored here
    // rather than the hex the toolbar itself passes to setColor/
    // setBackgroundColor.
    const source =
      '<p>Hi <span style="font-size: 24px; color: rgb(180, 35, 24); background-color: rgb(255, 243, 163);">combo</span></p>'
    const result = roundTripThroughEditor(source, BLOCK_TOKENS)
    expect(normalizeForCompare(result)).toBe(normalizeForCompare(source))
  })

  it("keeps a font-size span readable when it wraps a link, instead of lifting it to an opaque block", () => {
    // Link's own attribute normalization (target/rel) is pre-existing editor
    // behavior, unrelated to font size — so this checks the size and href
    // both survive rather than requiring byte-identical output.
    const source = '<p><a href="https://example.com"><span style="font-size: 20px;">link</span></a></p>'
    const result = roundTripThroughEditor(source, BLOCK_TOKENS)
    expect(result).toContain("font-size: 20px")
    expect(result).toContain('href="https://example.com"')
    expect(result).not.toContain("data-preserved-block")
  })

  it("preserves a real banking details block spliced between paragraphs", () => {
    const block = buildBankingDetailsBlock(
      {
        bank_name: "Example Bank",
        bank_account_name: "Luxus Travel & Tours",
        bank_account_number: "000000000",
        bank_branch_code: "250655",
        bank_swift_code: "EXMPZAJJ",
        company_address: "1 Example Street, Cape Town",
        company_reg_number: "2020/123456/07",
        company_vat_number: "4123456789",
        company_tel: "",
        company_cell: "",
        company_fax: "",
        company_email: "",
        company_website: "",
      },
      "BT-2026-0001-INV",
    )
    const source = `<p>Dear Sofia,</p>${block}<p>Kind regards,<br/>Luxus Travel &amp; Tours</p>`
    const result = roundTripThroughEditor(source, BLOCK_TOKENS)
    expect(normalizeForCompare(result)).toBe(normalizeForCompare(source))
  })
})
