import { describe, expect, it } from "vitest"
import { isEquivalentEditorHtml } from "@/lib/templates/rich-text/equivalent-html"

describe("isEquivalentEditorHtml", () => {
  it("treats the editor's style normalisation as no change", () => {
    expect(
      isEquivalentEditorHtml(
        '<p><span style="color:rgb(68, 80, 90)">SA Rail</span></p>',
        '<p><span style="color: rgb(68, 80, 90);">SA Rail</span></p>',
      ),
    ).toBe(true)
  })

  it("treats bare text and the editor's paragraph-wrapped copy as no change", () => {
    expect(isEquivalentEditorHtml("Plain text", "<p>Plain text</p>")).toBe(true)
    expect(isEquivalentEditorHtml("Line one<br>Line two", "<p>Line one<br>Line two</p>")).toBe(true)
  })

  it("treats every blank form as equal", () => {
    expect(isEquivalentEditorHtml("", "<p></p>")).toBe(true)
  })

  it("still sees a real change", () => {
    expect(isEquivalentEditorHtml("<p>Company</p>", "<p>Company Ltd</p>")).toBe(false)
    expect(isEquivalentEditorHtml("<p>Company</p>", "")).toBe(false)
    expect(
      isEquivalentEditorHtml(
        '<p><span style="color:rgb(68, 80, 90)">SA Rail</span></p>',
        '<p><span style="color: rgb(0, 0, 0);">SA Rail</span></p>',
      ),
    ).toBe(false)
  })
})
