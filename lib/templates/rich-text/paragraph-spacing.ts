// Block-level paragraph spacing (space after) for the rich-text email body
// editor — the sibling of line-height.ts.
//
// Stored as an inline `style="margin: 0 0 …"` on the <p> or <li> itself: email
// clients need it inline, and the inline value beats the email layout's
// default paragraph margin (emails/base-layout.tsx). The value is always one
// of the allowlisted options in lib/email/appearance.ts — parsing drops
// anything else, so pasted markup can't smuggle arbitrary CSS in through this
// attribute. A list item's paragraph carries its spacing on the <li> (see
// block-attribute.ts). Run setBlockParagraphSpacing through the core `command`
// escape hatch, like setBlockLineHeight.

import { Extension, type CommandProps } from "@tiptap/react"
import type { EditorState } from "@tiptap/pm/state"
import {
  isEmailParagraphSpacing,
  toEmailParagraphSpacing,
  toEmailParagraphSpacingMargin,
  type EmailParagraphSpacing,
} from "@/lib/email/appearance"
import {
  applyBlockAttribute,
  getActiveBlockAttribute,
  LIST_ITEM,
  PARAGRAPH,
} from "@/lib/templates/rich-text/block-attribute"

const ATTRIBUTE = "paragraphSpacing"

function isZeroOrUnset(value: string): boolean {
  return value === "" || value === "0" || value === "0px"
}

/** The spacing an element's inline margin names, or null unless only its bottom margin is set. */
function parseSpacing(element: HTMLElement): EmailParagraphSpacing | null {
  const { marginTop, marginRight, marginLeft, marginBottom } = element.style
  if (![marginTop, marginRight, marginLeft].every(isZeroOrUnset)) return null
  return toEmailParagraphSpacing(marginBottom)
}

export const BlockParagraphSpacing = Extension.create({
  name: "blockParagraphSpacing",

  addGlobalAttributes() {
    return [
      {
        types: [PARAGRAPH, LIST_ITEM],
        attributes: {
          [ATTRIBUTE]: {
            default: null,
            parseHTML: parseSpacing,
            renderHTML: (attributes: Record<string, unknown>) => {
              const value = toEmailParagraphSpacing(attributes[ATTRIBUTE] as string | null | undefined)
              return value ? { style: `margin: ${toEmailParagraphSpacingMargin(value)}` } : {}
            },
          },
        },
      },
    ]
  },
})

/**
 * Command that sets the space after every paragraph the selection touches (a
 * list item's paragraph sets it on the list item), or with null clears it back
 * to the email default. Rejects anything outside the allowlist.
 */
export function setBlockParagraphSpacing(spacing: EmailParagraphSpacing | null): (props: CommandProps) => boolean {
  return ({ tr, dispatch }) => {
    if (spacing !== null && !isEmailParagraphSpacing(spacing)) return false
    return applyBlockAttribute(tr, ATTRIBUTE, spacing, Boolean(dispatch))
  }
}

/**
 * Paragraph spacing in effect where the selection starts: the paragraph's own
 * value, else its enclosing list item's, else null (the email default).
 */
export function getActiveBlockParagraphSpacing(state: EditorState): EmailParagraphSpacing | null {
  return getActiveBlockAttribute(state, ATTRIBUTE, toEmailParagraphSpacing)
}
