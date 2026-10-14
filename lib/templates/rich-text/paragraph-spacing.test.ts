// Drives a real headless Editor over the shared schema: the toolbar's
// paragraph spacing command, what it serialises to, and what the toolbar reads
// back. Expected HTML carries the DOM's canonical `margin: 0px 0px X;` form
// (trailing semicolon), the shape real saved content has.

import { afterEach, describe, it, expect } from "vitest"
import { Editor } from "@tiptap/react"
import { buildEditorExtensions } from "@/lib/templates/rich-text/editor-extensions"
import { toEditorHtml, fromEditorHtml, normalizeForCompare, canRoundTrip } from "@/lib/templates/rich-text/serialize"
import {
  getActiveBlockParagraphSpacing,
  setBlockParagraphSpacing,
} from "@/lib/templates/rich-text/paragraph-spacing"
import { setBlockLineHeight } from "@/lib/templates/rich-text/line-height"
import type { EmailParagraphSpacing } from "@/lib/email/appearance"

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

describe("setBlockParagraphSpacing", () => {
  it("sets an inline bottom margin on the paragraph at the cursor only", () => {
    const e = makeEditor("<p>One</p><p>Two</p>")
    e.chain().setTextSelection(2).command(setBlockParagraphSpacing("24px")).run()
    expect(output(e)).toBe('<p style="margin: 0px 0px 24px;">One</p><p>Two</p>')
  })

  it("sets every paragraph a range selection touches", () => {
    const e = makeEditor("<p>One</p><p>Two</p>")
    e.chain().selectAll().command(setBlockParagraphSpacing("0px")).run()
    // The DOM collapses an all-zero shorthand to a single value.
    const saved = fromEditorHtml(e.getHTML())
    expect(normalizeForCompare(saved)).toBe('<p style="margin: 0px;">One</p><p style="margin: 0px;">Two</p>')
    expect(canRoundTrip(saved, [])).toBe(true)
  })

  it("puts a list item's spacing on the <li>, which survives the <li><p> unwrap", () => {
    const e = makeEditor("<ul><li>One</li><li>Two</li></ul><p>After</p>")
    e.chain().setTextSelection(3).command(setBlockParagraphSpacing("16px")).run()
    expect(output(e)).toBe('<ul><li style="margin: 0px 0px 16px;">One</li><li>Two</li></ul><p>After</p>')
  })

  it("combines with line spacing on the same paragraph", () => {
    const e = makeEditor("<p>One</p>")
    e.chain().setTextSelection(2).command(setBlockLineHeight("1.5")).command(setBlockParagraphSpacing("32px")).run()
    const saved = fromEditorHtml(e.getHTML())
    expect(normalizeForCompare(saved)).toBe('<p style="line-height: 1.5; margin: 0px 0px 32px;">One</p>')
    // And the combined shape reopens as rich content.
    expect(canRoundTrip(saved, [])).toBe(true)
  })

  it("clears the spacing back to the email default with null, leaving line spacing alone", () => {
    const e = makeEditor(
      '<p style="line-height: 2; margin: 0 0 24px;">One</p><ul><li style="margin: 0 0 16px;">Two</li></ul>',
    )
    e.chain().selectAll().command(setBlockParagraphSpacing(null)).run()
    expect(output(e)).toBe('<p style="line-height: 2;">One</p><ul><li>Two</li></ul>')
  })

  it("rejects a value outside the allowlist without touching the document", () => {
    const e = makeEditor("<p>One</p>")
    const applied = e
      .chain()
      .setTextSelection(2)
      .command(setBlockParagraphSpacing("8px; color: red" as EmailParagraphSpacing))
      .run()
    expect(applied).toBe(false)
    expect(output(e)).toBe("<p>One</p>")
  })
})

describe("parsing", () => {
  it("drops an off-allowlist bottom margin from pasted markup", () => {
    const e = makeEditor("<p>x</p>")
    e.commands.setContent('<p style="margin: 0 0 13px">Pasted</p>')
    expect(output(e)).toBe("<p>Pasted</p>")
  })

  it("drops a pasted margin that also sets a top or side margin", () => {
    const e = makeEditor("<p>x</p>")
    e.commands.setContent('<p style="margin: 10px 0 16px">Pasted</p>')
    expect(output(e)).toBe("<p>Pasted</p>")
  })

  it("moves spacing pasted onto a list item's inner <p> to the <li>, merged with the item's own style", () => {
    const e = makeEditor("<p>x</p>")
    e.commands.setContent('<ul><li style="line-height: 2"><p style="margin: 0 0 24px">Pasted</p></li></ul>')
    // The editor keeps the paragraph's own spacing on the <p> until a toolbar
    // change moves it; the unwrap on save merges it into the <li>.
    expect(output(e)).toBe('<ul><li style="line-height: 2; margin: 0px 0px 24px;">Pasted</li></ul>')
  })
})

describe("getActiveBlockParagraphSpacing", () => {
  it("reads the paragraph's spacing, the enclosing list item's, or null for the default", () => {
    const e = makeEditor(
      '<p style="margin: 0 0 24px;">One</p><ul><li style="margin: 0 0 0px;">Two</li></ul><p>Three</p>',
    )
    e.commands.setTextSelection(2)
    expect(getActiveBlockParagraphSpacing(e.state)).toBe("24px")

    // Inside "Two": doc > ul (5) > li (6) > p (7) > text from 8.
    e.commands.setTextSelection(9)
    expect(getActiveBlockParagraphSpacing(e.state)).toBe("0px")

    e.commands.setTextSelection(e.state.doc.content.size - 2)
    expect(getActiveBlockParagraphSpacing(e.state)).toBeNull()
  })
})
