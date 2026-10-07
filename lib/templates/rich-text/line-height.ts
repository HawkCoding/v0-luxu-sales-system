// Block-level line spacing for the rich-text email body editor.
//
// Stored as an inline `style="line-height: …"` on the <p> or <li> itself:
// email clients need it inline, and line spacing is a property of the block,
// not of a run of text. The value is always one of the allowlisted options in
// lib/email/appearance.ts — parsing drops anything else, so pasted markup can't
// smuggle arbitrary CSS in through this attribute.
//
// A paragraph inside a list item carries its spacing on the <li>, never on the
// inner <p>: fromEditorHtml unwraps `<li><p>x</p></li>` to `<li>x</li>` for
// email clients, so a value on the <p> would only survive by being moved to
// the <li> anyway. Keeping it on the list item in the editor too means what
// the toolbar shows is exactly what gets stored and reloaded.
//
// No Tiptap command augmentation (the "@tiptap/core" module isn't resolvable
// from app code under pnpm, and @tiptap/extension-text-style already claims
// the setLineHeight/unsetLineHeight names for its inline variant), so the
// toolbar runs setBlockLineHeight through the core `command` escape hatch.

import { Extension, type CommandProps } from "@tiptap/react"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { EditorState, Selection } from "@tiptap/pm/state"
import { isEmailLineHeight, toEmailLineHeight, type EmailLineHeight } from "@/lib/email/appearance"

const ATTRIBUTE = "lineHeight"
const PARAGRAPH = "paragraph"
const LIST_ITEM = "listItem"

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

interface AttributeUpdate {
  pos: number
  value: EmailLineHeight | null
}

function collectUpdates(doc: ProseMirrorNode, selection: Selection, lineHeight: EmailLineHeight | null): AttributeUpdate[] {
  const updates: AttributeUpdate[] = []
  const seenListItems = new Set<number>()
  for (const range of selection.ranges) {
    doc.nodesBetween(range.$from.pos, range.$to.pos, (node, pos) => {
      if (node.type.name !== PARAGRAPH) return true
      const $pos = doc.resolve(pos)
      if ($pos.parent.type.name === LIST_ITEM) {
        const listItemPos = $pos.before()
        if (!seenListItems.has(listItemPos)) {
          seenListItems.add(listItemPos)
          updates.push({ pos: listItemPos, value: lineHeight })
        }
        if (node.attrs[ATTRIBUTE] !== null) updates.push({ pos, value: null })
      } else {
        updates.push({ pos, value: lineHeight })
      }
      // A paragraph holds only inline content — nothing below it to visit.
      return false
    })
  }
  return updates
}

/**
 * Command that sets the line spacing of every paragraph the selection touches
 * (a list item's paragraph sets it on the list item), or with null clears it
 * back to the email default. Rejects anything outside the allowlist. Run it
 * via the core `command` command: `editor.chain().focus().command(setBlockLineHeight("1.5")).run()`.
 */
export function setBlockLineHeight(lineHeight: EmailLineHeight | null): (props: CommandProps) => boolean {
  return ({ tr, dispatch }) => {
    if (lineHeight !== null && !isEmailLineHeight(lineHeight)) return false
    const updates = collectUpdates(tr.doc, tr.selection, lineHeight)
    if (updates.length === 0) return false
    if (dispatch) {
      // AttrSteps never move content, so the collected positions stay valid.
      for (const { pos, value } of updates) tr.setNodeAttribute(pos, ATTRIBUTE, value)
    }
    return true
  }
}

/**
 * Line spacing in effect where the selection starts: the paragraph's own
 * value, else its enclosing list item's, else null (the email default).
 */
export function getActiveBlockLineHeight(state: EditorState): EmailLineHeight | null {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth)
    if (node.type.name === PARAGRAPH) {
      const own = toEmailLineHeight(node.attrs[ATTRIBUTE] as string | null | undefined)
      if (own) return own
    } else if (node.type.name === LIST_ITEM) {
      return toEmailLineHeight(node.attrs[ATTRIBUTE] as string | null | undefined)
    }
  }
  return null
}
