import { describe, it, expect } from "vitest"
import { fillEmptyParagraphs } from "@/lib/templates/empty-paragraphs"

describe("fillEmptyParagraphs", () => {
  it("puts a break in a bare empty paragraph", () => {
    expect(fillEmptyParagraphs("<p>a</p><p></p><p>b</p>")).toBe("<p>a</p><p><br></p><p>b</p>")
  })

  it("keeps the spacing styles on an empty paragraph", () => {
    expect(fillEmptyParagraphs('<p style="line-height: 1.15; margin: 0px;"></p>')).toBe(
      '<p style="line-height: 1.15; margin: 0px;"><br></p>',
    )
  })

  it("treats a whitespace-only paragraph as empty", () => {
    expect(fillEmptyParagraphs("<p> \n </p>")).toBe("<p><br></p>")
  })

  it("leaves paragraphs with content, already-filled paragraphs and other tags alone", () => {
    const html = "<p>x</p><p><br></p><pre></pre><p><span></span></p>"
    expect(fillEmptyParagraphs(html)).toBe(html)
  })
})
