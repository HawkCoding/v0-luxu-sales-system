// Shared plumbing for the toolbar's block-level controls (line spacing,
// paragraph spacing): a value that lives on a <p>, or on the <li> for a
// paragraph inside a list item.
//
// A paragraph inside a list item carries the value on the <li>, never on the
// inner <p>: fromEditorHtml unwraps `<li><p>x</p></li>` to `<li>x</li>` for
// email clients, so a value on the <p> would only survive by being moved to
// the <li> anyway. Keeping it on the list item in the editor too means what
// the toolbar shows is exactly what gets stored and reloaded.

import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { EditorState, Selection, Transaction } from "@tiptap/pm/state"

export const PARAGRAPH = "paragraph"
export const LIST_ITEM = "listItem"

interface AttributeUpdate {
  pos: number
  value: string | null
}

function collectUpdates(
  doc: ProseMirrorNode,
  selection: Selection,
  attribute: string,
  value: string | null,
): AttributeUpdate[] {
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
          updates.push({ pos: listItemPos, value })
        }
        if (node.attrs[attribute] !== null) updates.push({ pos, value: null })
      } else {
        updates.push({ pos, value })
      }
      // A paragraph holds only inline content — nothing below it to visit.
      return false
    })
  }
  return updates
}

/**
 * Sets `attribute` on every paragraph the selection touches (a list item's
 * paragraph sets it on the list item). Returns false when the selection
 * touches no paragraph. Only writes to `tr` when `dispatch` is true.
 */
export function applyBlockAttribute(tr: Transaction, attribute: string, value: string | null, dispatch: boolean): boolean {
  const updates = collectUpdates(tr.doc, tr.selection, attribute, value)
  if (updates.length === 0) return false
  if (dispatch) {
    // AttrSteps never move content, so the collected positions stay valid.
    for (const update of updates) tr.setNodeAttribute(update.pos, attribute, update.value)
  }
  return true
}

/**
 * Value of `attribute` in effect where the selection starts: the paragraph's
 * own value, else its enclosing list item's, else null (the email default).
 * `normalize` maps a raw attribute to an allowlisted value or null.
 */
export function getActiveBlockAttribute<T extends string>(
  state: EditorState,
  attribute: string,
  normalize: (value: string | null | undefined) => T | null,
): T | null {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth)
    if (node.type.name === PARAGRAPH) {
      const own = normalize(node.attrs[attribute] as string | null | undefined)
      if (own) return own
    } else if (node.type.name === LIST_ITEM) {
      return normalize(node.attrs[attribute] as string | null | undefined)
    }
  }
  return null
}
