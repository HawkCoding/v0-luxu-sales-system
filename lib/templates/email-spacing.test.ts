import { describe, expect, it } from "vitest"
import { CONTENT_SLOT_END, CONTENT_SLOT_START, extractContentSlot } from "./content-slot"
import {
  finalizeContentSlot,
  INLINE_LIST_SPACING,
  INLINE_PARAGRAPH_SPACING,
  inlineContentSpacing,
} from "./email-spacing"

describe("inlineContentSpacing", () => {
  it("writes the head rule's 8px spacing inline on every plain paragraph", () => {
    expect(inlineContentSpacing("<p>Dear Jane,</p><p>Thanks</p>")).toBe(
      `<p style="${INLINE_PARAGRAPH_SPACING}">Dear Jane,</p><p style="${INLINE_PARAGRAPH_SPACING}">Thanks</p>`,
    )
  })

  it("merges into an existing style without a margin", () => {
    expect(inlineContentSpacing('<p style="line-height: 2">Spaced</p>')).toBe(
      '<p style="margin:0 0 8px;line-height: 2">Spaced</p>',
    )
    expect(inlineContentSpacing("<p class=\"x\" style='color: red;'>Red</p>")).toBe(
      "<p class=\"x\" style='margin:0 0 8px;color: red;'>Red</p>",
    )
  })

  it("adds a style attribute beside other attributes", () => {
    expect(inlineContentSpacing('<p class="lead">Hi</p>')).toBe('<p class="lead" style="margin:0 0 8px;">Hi</p>')
  })

  it("leaves a paragraph that sets its own margin alone", () => {
    const html =
      '<p style="line-height: 1.15; margin: 0px 0px 24px;">Editor spacing</p>' +
      '<p style="margin:0 0 6px;color:#312b24;">Quote line</p>' +
      '<p style="margin-top: 4px">Longhand</p>'
    expect(inlineContentSpacing(html)).toBe(html)
  })

  it.each([
    ["<p><br></p>", "<p style=\"margin:0 0 8px;\">&nbsp;</p>"],
    ["<p><br/></p>", "<p style=\"margin:0 0 8px;\">&nbsp;</p>"],
    ["<p> <br /> </p>", "<p style=\"margin:0 0 8px;\">&nbsp;</p>"],
    ["<p></p>", "<p style=\"margin:0 0 8px;\">&nbsp;</p>"],
    ["<p>   </p>", "<p style=\"margin:0 0 8px;\">&nbsp;</p>"],
    ["<p>&nbsp;</p>", "<p style=\"margin:0 0 8px;\">&nbsp;</p>"],
    ['<p style="margin: 0px;"><br></p>', '<p style="margin: 0px;">&nbsp;</p>'],
  ])("turns the blank line %s into a non-breaking-space paragraph Outlook keeps", (input, expected) => {
    expect(inlineContentSpacing(input)).toBe(expected)
  })

  it("keeps a paragraph of two line breaks, which is two blank lines", () => {
    expect(inlineContentSpacing("<p><br><br></p>")).toBe('<p style="margin:0 0 8px;"><br><br></p>')
  })

  it("indents lists with a margin, not padding Outlook ignores", () => {
    expect(inlineContentSpacing("<ul><li>One</li></ul><ol><li>Two</li></ol>")).toBe(
      `<ul style="${INLINE_LIST_SPACING}"><li>One</li></ul><ol style="${INLINE_LIST_SPACING}"><li>Two</li></ol>`,
    )
  })

  it("leaves a list that sets its own margin or padding alone", () => {
    const html = '<ul style="margin: 0 0 0 30px;"><li>a</li></ul><ol style="padding-left: 10px"><li>b</li></ol>'
    expect(inlineContentSpacing(html)).toBe(html)
  })

  it("never touches look-alike tags", () => {
    const html = "<pre>code</pre><picture></picture><table><tr><td>x</td></tr></table>"
    expect(inlineContentSpacing(html)).toBe(html)
  })

  it("is idempotent", () => {
    const html =
      '<p>Dear Jane,</p><p><br></p><p style="line-height: 1.5;">x</p><ul><li>a</li></ul><p style="margin: 0px;"></p>'
    const once = inlineContentSpacing(html)
    expect(inlineContentSpacing(once)).toBe(once)
  })
})

describe("finalizeContentSlot", () => {
  const wrap = (content: string) =>
    `<html><head><style>.luxus-content p { margin: 0 0 8px; }</style></head><body>` +
    `<p>Outside before</p><div class="luxus-content">${CONTENT_SLOT_START}${content}${CONTENT_SLOT_END}</div>` +
    `<p style="font-size:10px">Signature</p><p>Outside after</p></body></html>`

  it("inlines the spacing inside the content slot only", () => {
    const out = finalizeContentSlot(wrap("<p>Body</p><p><br></p>"))
    expect(extractContentSlot(out)).toBe(
      '<p style="margin:0 0 8px;">Body</p><p style="margin:0 0 8px;">&nbsp;</p>',
    )
    expect(out).toContain("<p>Outside before</p>")
    expect(out).toContain('<p style="font-size:10px">Signature</p><p>Outside after</p>')
    expect(out).toContain("<style>.luxus-content p { margin: 0 0 8px; }</style>")
  })

  it("returns HTML without slot markers unchanged", () => {
    const html = "<p>Plain notice</p><p><br></p>"
    expect(finalizeContentSlot(html)).toBe(html)
  })

  it("is idempotent", () => {
    const once = finalizeContentSlot(wrap("<p>Body</p><ul><li>a</li></ul>"))
    expect(finalizeContentSlot(once)).toBe(once)
  })
})
