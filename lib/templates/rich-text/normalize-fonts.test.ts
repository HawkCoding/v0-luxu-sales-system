import { describe, it, expect } from "vitest"
import {
  normalizeFontDeclarations,
  normalizeSpanFonts,
  normalizeSpanFontsHtml,
} from "@/lib/templates/rich-text/normalize-fonts"

const CALIBRI = "Calibri, Candara, Segoe, 'Segoe UI', Optima, Arial, sans-serif"
const VERDANA = "Verdana, Geneva, sans-serif"

describe("normalizeFontDeclarations", () => {
  it("snaps an Outlook pt size and short Calibri stack onto the allowlist, keeping the colour", () => {
    expect(
      normalizeFontDeclarations("font-size: 12pt; font-family: Calibri, sans-serif; color: rgb(38, 38, 38);"),
    ).toBe(`font-size: 16px; font-family: ${CALIBRI}; color: rgb(38, 38, 38);`)
  })

  it("maps a quoted Word family to its stack", () => {
    expect(normalizeFontDeclarations('font-size: 10pt; font-family: "Verdana", sans-serif')).toBe(
      `font-size: 13px; font-family: ${VERDANA};`,
    )
  })

  it("drops a family we don't offer", () => {
    expect(normalizeFontDeclarations('font-size: 12pt; font-family: "Segoe UI Emoji", sans-serif')).toBe(
      "font-size: 16px;",
    )
  })

  it("keeps a size it can't map, for the serializer to lock", () => {
    expect(normalizeFontDeclarations("font-size: 2em")).toBe("font-size: 2em")
    expect(normalizeFontDeclarations("font-size: 72px")).toBe("font-size: 72px")
  })

  it("returns the input byte for byte when everything is already allowlisted", () => {
    const style = `font-size:12px;font-family:${VERDANA}`
    expect(normalizeFontDeclarations(style)).toBe(style)
  })

  it("returns an empty string when nothing is left", () => {
    expect(normalizeFontDeclarations("font-family: Wingdings")).toBe("")
  })
})

describe("normalizeSpanFonts", () => {
  it("rewrites nested spans and removes a style left empty", () => {
    const doc = new DOMParser().parseFromString(
      '<p><span style="font-family: Wingdings">a</span><b><span style="font-size: 11pt">b</span></b></p>',
      "text/html",
    )
    normalizeSpanFonts(doc.body)
    expect(doc.body.innerHTML).toBe('<p><span>a</span><b><span style="font-size: 15px;">b</span></b></p>')
  })

  it("leaves non-span elements alone", () => {
    const doc = new DOMParser().parseFromString('<p style="font-size: 12pt">x</p>', "text/html")
    normalizeSpanFonts(doc.body)
    expect(doc.body.innerHTML).toBe('<p style="font-size: 12pt">x</p>')
  })
})

describe("normalizeSpanFontsHtml", () => {
  it("normalizes a Word clipboard fragment", () => {
    const pasted =
      '<html><body><!--StartFragment--><p class="MsoNormal"><span style="font-size:10.0pt;font-family:&quot;Verdana&quot;,sans-serif">Hi</span></p><!--EndFragment--></body></html>'
    expect(normalizeSpanFontsHtml(pasted)).toContain(`<span style="font-size: 13px; font-family: ${VERDANA};">Hi</span>`)
  })
})
