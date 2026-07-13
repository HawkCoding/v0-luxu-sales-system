// Ensures the document always ends in an empty paragraph, so a template ending
// in an atom (e.g. {{quoteSummaryTable}}) still leaves somewhere to click and
// type after it.

import { Extension } from "@tiptap/react"
import { Plugin, PluginKey } from "@tiptap/pm/state"

export const TrailingParagraph = Extension.create({
  name: "trailingParagraph",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("trailingParagraph"),
        appendTransaction: (_transactions, _oldState, newState) => {
          const { doc, tr, schema } = newState
          const paragraph = schema.nodes.paragraph
          if (!paragraph) return null
          const last = doc.lastChild
          if (last && last.type === paragraph) return null
          return tr.insert(doc.content.size, paragraph.create())
        },
      }),
    ]
  },
})
