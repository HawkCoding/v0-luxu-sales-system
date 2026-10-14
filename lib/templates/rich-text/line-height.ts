// Block-level line spacing for the rich-text email body editor.
//
// Stored as an inline `style="line-height: …"` on the <p> or <li> itself:
// email clients need it inline, and line spacing is a property of the block,
// not of a run of text. The value is always one of the allowlisted options in
// lib/email/appearance.ts — parsing drops anything else, so pasted markup can't
// smuggle arbitrary CSS in through this attribute. A list item's paragraph
// carries its spacing on the <li> (see block-attribute.ts).
//
// No Tiptap command augmentation (the "@tiptap/core" module isn't resolvable
// from app code under pnpm, and @tiptap/extension-text-style already claims
// the setLineHeight/unsetLineHeight names for its inline variant), so the
// toolbar runs setBlockLineHeight through the core `command` escape hatch.

import { Extension, type CommandProps } from "@tiptap/react"
import type { EditorState } from "@tiptap/pm/state"
import { isEmailLineHeight, toEmailLineHeight, type EmailLineHeight } from "@/lib/email/appearance"
import {
  applyBlockAttribute,
  getActiveBlockAttribute,
  LIST_ITEM,
  PARAGRAPH,
} from "@/lib/templates/rich-text/block-attribute"

const ATTRIBUTE = "lineHeight"

export const BlockLineHeight = Extension.create({
  name: "blockLineHeight",

  addGlobalAttributes() {
    return [
      {
        types: [PARAGRAPH, LIST_ITEM],
        attributes: {
          [ATTRIBUTE]: {
            default: null,
            parseHTML: (element: HTMLElement) => toEmailLineHeight(element.style.lineHeight),
            renderHTML: (attributes: Record<string, unknown>) => {
              const value = toEmailLineHeight(attributes[ATTRIBUTE] as string | null | undefined)
              return value ? { style: `line-height: ${value}` } : {}
            },
          },
        },
      },
    ]
  },
})

/**
 * Command that sets the line spacing of every paragraph the selection touches
 * (a list item's paragraph sets it on the list item), or with null clears it
 * back to the email default. Rejects anything outside the allowlist. Run it
 * via the core `command` command: `editor.chain().focus().command(setBlockLineHeight("1.5")).run()`.
 */
export function setBlockLineHeight(lineHeight: EmailLineHeight | null): (props: CommandProps) => boolean {
  return ({ tr, dispatch }) => {
    if (lineHeight !== null && !isEmailLineHeight(lineHeight)) return false
    return applyBlockAttribute(tr, ATTRIBUTE, lineHeight, Boolean(dispatch))
  }
}

/**
 * Line spacing in effect where the selection starts: the paragraph's own
 * value, else its enclosing list item's, else null (the email default).
 */
export function getActiveBlockLineHeight(state: EditorState): EmailLineHeight | null {
  return getActiveBlockAttribute(state, ATTRIBUTE, toEmailLineHeight)
}
