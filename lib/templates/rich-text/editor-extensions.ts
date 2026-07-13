// The single source of truth for the editor's schema. Shared by the
// HtmlBodyEditor component and the round-trip tests so they cannot drift — a
// test that passes here guarantees the same schema the user edits with.

import StarterKit from "@tiptap/starter-kit"
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
    PreservedBlock,
    TrailingParagraph,
  ]
}
