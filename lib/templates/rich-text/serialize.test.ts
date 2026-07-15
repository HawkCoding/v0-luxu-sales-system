import { describe, it, expect } from "vitest"
import { toEditorHtml, fromEditorHtml, canRoundTrip, normalizeForCompare } from "@/lib/templates/rich-text/serialize"

const BLOCK_TOKENS = ["quoteSummaryTable", "bankingDetails"]

describe("toEditorHtml", () => {
  it("leaves plain rich content untouched", () => {
    const src = "<p>Dear <strong>Sofia</strong>,</p><p>Kind regards,<br/>Luxus</p>"
    const { html, warnings } = toEditorHtml(src, BLOCK_TOKENS)
    expect(normalizeForCompare(html)).toBe(normalizeForCompare(src))
    expect(warnings).toEqual([])
  })

  it("lifts a block token sitting between paragraphs into a placeholder (constraint 2)", () => {
    const src = "<p>Intro</p>{{quoteSummaryTable}}<p>Outro</p>"
    const { html } = toEditorHtml(src, BLOCK_TOKENS)
    expect(html).toContain('data-preserved-block')
    expect(html).toContain('data-token="quoteSummaryTable"')
    // The token must NOT be wrapped in a paragraph.
    expect(html).not.toContain("<p>{{quoteSummaryTable}}</p>")
  })

  it("lifts a styled table into an opaque placeholder carrying its encoded HTML", () => {
    const table = '<table style="width:100%"><tr><td>x</td></tr></table>'
    const { html } = toEditorHtml(`<p>a</p>${table}<p>b</p>`, BLOCK_TOKENS)
    expect(html).toContain("data-preserved-block")
    expect(html).toContain("data-html=")
    expect(html).not.toContain("<table")
  })

  it("warns when a block token is nested inside a paragraph", () => {
    const src = "<p>Total {{quoteSummaryTable}} here</p>"
    const { html, warnings } = toEditorHtml(src, BLOCK_TOKENS)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("quoteSummaryTable")
    // Left as literal text, not lifted.
    expect(html).toContain("{{quoteSummaryTable}}")
    expect(html).not.toContain("data-token")
  })

  it("does not treat a non-block token as a block", () => {
    const src = "<p>Hello {{customerName}}</p>"
    const { html } = toEditorHtml(src, BLOCK_TOKENS)
    expect(html).toContain("{{customerName}}")
    expect(html).not.toContain("data-preserved-block")
  })

  it("names an opaque placeholder from the element's data-label when present", () => {
    const src = '<p>a</p><div style="color:red" data-label="Total price">TOTAL: R 1</div><p>b</p>'
    const { html } = toEditorHtml(src, BLOCK_TOKENS)
    expect(html).toContain('data-label="Total price"')
  })

  it("falls back to a text snippet, then the tag name, for unlabelled opaque blocks", () => {
    const withText = toEditorHtml('<p>a</p><div style="color:red">Quote number: BT-1</div>', BLOCK_TOKENS)
    expect(withText.html).toContain("Quote number: BT-1")
    expect(withText.html).not.toContain('data-label="Div"')

    const bare = toEditorHtml('<p>a</p><hr style="border:none"/>', BLOCK_TOKENS)
    expect(bare.html).toContain('data-label="Divider line"')
  })
})

describe("fromEditorHtml", () => {
  it("restores a token placeholder to its {{token}}", () => {
    const editorHtml = '<p>a</p><div data-preserved-block data-label="X" data-token="quoteSummaryTable"></div><p>b</p>'
    expect(fromEditorHtml(editorHtml)).toBe("<p>a</p>{{quoteSummaryTable}}<p>b</p>")
  })

  it("restores an html placeholder to its exact decoded payload", () => {
    const payload = '<table style="width:100%"><tr><td>x</td></tr></table>'
    const editorHtml = `<p>a</p><div data-preserved-block data-html="${encodeURIComponent(payload)}"></div>`
    expect(fromEditorHtml(editorHtml)).toBe(`<p>a</p>${payload}`)
  })

  it("unwraps <p> inside <li>", () => {
    const editorHtml = "<ul><li><p>one</p></li><li><p>two</p></li></ul>"
    expect(fromEditorHtml(editorHtml)).toBe("<ul><li>one</li><li>two</li></ul>")
  })

  it("strips a single trailing empty paragraph", () => {
    expect(fromEditorHtml("<p>body</p><p></p>")).toBe("<p>body</p>")
  })
})

describe("round-trip identity (pure, no editor)", () => {
  it("style attributes containing quotes and ampersands survive the encoded trip", () => {
    const src = '<p>a</p><div style="font-family:\'Arial\';content:&amp;">x</div>'
    const restored = fromEditorHtml(toEditorHtml(src, BLOCK_TOKENS).html)
    expect(normalizeForCompare(restored)).toBe(normalizeForCompare(src))
  })

  it("canRoundTrip is true for a token between paragraphs", () => {
    expect(canRoundTrip("<p>a</p>{{quoteSummaryTable}}<p>b</p>", BLOCK_TOKENS)).toBe(true)
  })

  it("canRoundTrip is true for plain rich content", () => {
    expect(canRoundTrip("<p>Dear <em>friend</em></p>", BLOCK_TOKENS)).toBe(true)
  })
})
