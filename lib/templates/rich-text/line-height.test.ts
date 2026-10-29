// Drives a real headless Editor over the shared schema: the toolbar's line
// spacing command, what it serialises to, and what the toolbar reads back.
// Expected HTML carries the editor's own canonical `line-height: X;` form
// (trailing semicolon), the shape real saved content has.

import { afterEach, describe, it, expect } from "vitest"
import { Editor } from "@tiptap/react"
import { buildEditorExtensions } from "@/lib/templates/rich-text/editor-extensions"
import { toEditorHtml, fromEditorHtml, normalizeForCompare } from "@/lib/templates/rich-text/serialize"
import { getActiveBlockLineHeight, setBlockLineHeight } from "@/lib/templates/rich-text/line-height"
import type { EmailLineHeight } from "@/lib/email/appearance"

let editor: Editor | null = null

function makeEditor(source: string, blockTokens: string[] = []): Editor {
  editor = new Editor({
    extensions: buildEditorExtensions(),
    content: toEditorHtml(source, blockTokens).html,
  })
  return editor
}

function output(e: Editor): string {
  return normalizeForCompare(fromEditorHtml(e.getHTML()))
}

afterEach(() => {
  editor?.destroy()
  editor = null
})

describe("setBlockLineHeight", () => {
  it("sets an inline line-height on the paragraph at the cursor only", () => {
    const e = makeEditor("<p>One</p><p>Two</p>")
    e.chain().setTextSelection(2).command(setBlockLineHeight("1.5")).run()
    expect(output(e)).toBe('<p style="line-height: 1.5;">One</p><p>Two</p>')
  })

  it("sets every paragraph a range selection touches", () => {
    const e = makeEditor("<p>One</p><p>Two</p>")
    e.chain().selectAll().command(setBlockLineHeight("2")).run()
    expect(output(e)).toBe('<p style="line-height: 2;">One</p><p style="line-height: 2;">Two</p>')
  })

  it("does not leave the editor's styled trailing paragraph behind after a select-all", () => {
    // Ending on a block token makes the editor append an empty paragraph to type into.
    const e = makeEditor("<p>One</p>{{quoteSummaryTable}}", ["quoteSummaryTable"])
    e.chain().selectAll().command(setBlockLineHeight("1.15")).run()
    expect(output(e)).toBe('<p style="line-height: 1.15;">One</p>{{quoteSummaryTable}}')
  })

  it("puts a list item's spacing on the <li>, which survives the <li><p> unwrap", () => {
    const e = makeEditor("<ul><li>One</li><li>Two</li></ul><p>After</p>")
    // Position 3 is inside the first list item's paragraph.
    e.chain().setTextSelection(3).command(setBlockLineHeight("1.15")).run()
    expect(output(e)).toBe('<ul><li style="line-height: 1.15;">One</li><li>Two</li></ul><p>After</p>')
  })

  it("clears the spacing back to the email default with null", () => {
    const e = makeEditor('<p style="line-height: 1.5;">One</p><ul><li style="line-height: 2;">Two</li></ul>')
    e.chain().selectAll().command(setBlockLineHeight(null)).run()
    expect(output(e)).toBe("<p>One</p><ul><li>Two</li></ul>")
  })

  it("rejects a value outside the allowlist without touching the document", () => {
    const e = makeEditor("<p>One</p>")
    const applied = e
      .chain()
      .setTextSelection(2)
      .command(setBlockLineHeight("3; color: red" as EmailLineHeight))
      .run()
    expect(applied).toBe(false)
    expect(output(e)).toBe("<p>One</p>")
  })
})

describe("parsing", () => {
  it("drops an off-allowlist line-height from pasted markup", () => {
    const e = makeEditor("<p>x</p>")
    e.commands.setContent('<p style="line-height: 7">Pasted</p>')
    expect(output(e)).toBe("<p>Pasted</p>")
  })

  it("moves a line-height pasted onto a list item's inner <p> to the <li> on save", () => {
    const e = makeEditor("<p>x</p>")
    e.commands.setContent('<ul><li><p style="line-height: 1.5">Pasted</p></li></ul>')
    expect(output(e)).toBe('<ul><li style="line-height: 1.5;">Pasted</li></ul>')
  })
})

describe("getActiveBlockLineHeight", () => {
  it("reads the paragraph's spacing, the enclosing list item's, or null for the default", () => {
    const e = makeEditor('<p style="line-height: 1.5;">One</p><ul><li style="line-height: 2;">Two</li></ul><p>Three</p>')
    e.commands.setTextSelection(2)
    expect(getActiveBlockLineHeight(e.state)).toBe("1.5")

    // Inside "Two": doc > ul (5) > li (6) > p (7) > text from 8.
    e.commands.setTextSelection(9)
    expect(getActiveBlockLineHeight(e.state)).toBe("2")

    e.commands.setTextSelection(e.state.doc.content.size - 2)
    expect(getActiveBlockLineHeight(e.state)).toBeNull()
  })
})
