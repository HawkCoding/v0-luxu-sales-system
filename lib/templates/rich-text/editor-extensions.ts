// The single source of truth for the editor's schema. Shared by the
// HtmlBodyEditor component and the round-trip tests so they cannot drift — a
// test that passes here guarantees the same schema the user edits with.

import StarterKit from "@tiptap/starter-kit"
import { TextStyle, FontSize, FontFamily, Color, BackgroundColor } from "@tiptap/extension-text-style"
import type { Extensions } from "@tiptap/react"
import { PreservedBlock } from "@/lib/templates/rich-text/preserved-block"
import { TrailingParagraph } from "@/lib/templates/rich-text/trailing-paragraph"

export function buildEditorExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: false,
      codeBlock: false,
      blockquote: false,
      horizontalRule: false,
      code: false,
    }),
    // TextStyle renders the <span> that carries FontSize/FontFamily/Color/
    // BackgroundColor's inline styles — all required for the toolbar's
    // per-section font size, typeface, text colour, and highlight (see
    // lib/templates/rich-text/serialize.ts, which only lets this exact
    // shape of span survive as rich content). Tiptap merges all four into
    // one `style` attribute automatically when combined on the same run.
    TextStyle,
    FontSize,
    FontFamily,
    Color,
    BackgroundColor,
    PreservedBlock,
    TrailingParagraph,
  ]
}
