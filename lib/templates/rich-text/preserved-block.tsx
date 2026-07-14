// Opaque atom node holding markup the editor schema cannot faithfully
// represent (system-generated tables/banking blocks, or block tokens on the
// Templates page). The raw payload rides in URI-encoded data attributes and is
// never parsed into the document, so the editor cannot mangle it. In the canvas
// it renders as a locked placeholder card; the real markup shows in the live
// preview iframe beside the editor.

import { Node, mergeAttributes, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react"
import { Lock, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PRESERVED_BLOCK_NODE_NAME, PRESERVED_BLOCK_TAG } from "@/lib/templates/rich-text/preserved-block-shared"

function PreservedBlockView({ node, deleteNode, editor }: NodeViewProps) {
  const label = (node.attrs.label as string) || "Preserved HTML"
  return (
    <NodeViewWrapper
      contentEditable={false}
      data-drag-handle
      className="my-2 flex select-none items-center gap-2 rounded-md border border-dashed border-border bg-muted/50 px-3 py-2"
    >
      <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="text-xs text-muted-foreground">
        {label} — system generated, shown in the preview
      </span>
      {editor.isEditable && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-6 w-6 p-0"
          onClick={deleteNode}
          aria-label={`Remove ${label}`}
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </NodeViewWrapper>
  )
}

export const PreservedBlock = Node.create({
  name: PRESERVED_BLOCK_NODE_NAME,
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      html: {
        default: null,
        parseHTML: (el) => {
          const raw = el.getAttribute("data-html")
          return raw ? decodeURIComponent(raw) : null
        },
        renderHTML: (attrs) =>
          attrs.html ? { "data-html": encodeURIComponent(attrs.html as string) } : {},
      },
      token: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-token"),
        renderHTML: (attrs) => (attrs.token ? { "data-token": attrs.token as string } : {}),
      },
      label: {
        default: "Preserved HTML",
        parseHTML: (el) => el.getAttribute("data-label") ?? "Preserved HTML",
        renderHTML: (attrs) => ({ "data-label": attrs.label as string }),
      },
    }
  },

  parseHTML() {
    return [{ tag: PRESERVED_BLOCK_TAG }]
  },

  renderHTML({ HTMLAttributes }) {
    // Empty div — the payload lives in the attributes, never in the DOM subtree.
    return ["div", mergeAttributes(HTMLAttributes, { "data-preserved-block": "" })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(PreservedBlockView)
  },
})
