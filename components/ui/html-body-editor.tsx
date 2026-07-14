"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import {
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Redo2,
  Undo2,
  Code2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Toggle } from "@/components/ui/toggle"
import { Separator } from "@/components/ui/separator"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { buildEditorExtensions } from "@/lib/templates/rich-text/editor-extensions"
import { toEditorHtml, fromEditorHtml, canRoundTrip } from "@/lib/templates/rich-text/serialize"

export interface HtmlBodyEditorProps {
  value: string
  onChange: (html: string) => void
  /** Names of block-kind tokens ({{name}}) to treat as opaque blocks. */
  blockTokens?: string[]
  disabled?: boolean
  minHeight?: string
  id?: string
}

type Mode = "rich" | "source"

const EMPTY_BLOCK_TOKENS: string[] = []

export function HtmlBodyEditor({
  value,
  onChange,
  blockTokens = EMPTY_BLOCK_TOKENS,
  disabled = false,
  minHeight = "16rem",
  id,
}: HtmlBodyEditorProps) {
  // Content too exotic to round-trip opens in source mode with the rich toggle
  // disabled — the user is never worse off than the old raw-HTML textarea.
  const richSafe = useMemo(() => canRoundTrip(value, blockTokens), [])
  const [mode, setMode] = useState<Mode>(richSafe ? "rich" : "source")
  const [sourceDraft, setSourceDraft] = useState(value)
  const lastEmitted = useRef(value)

  const emit = useCallback(
    (html: string) => {
      lastEmitted.current = html
      onChange(html)
    },
    [onChange],
  )

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: buildEditorExtensions(),
    content: toEditorHtml(value, blockTokens).html,
    editorProps: {
      attributes: {
        class: "prose-email focus:outline-none px-3 py-2",
        style: `min-height:${minHeight}`,
      },
    },
    onUpdate: ({ editor }) => {
      emit(fromEditorHtml(editor.getHTML()))
    },
  })

  useEffect(() => {
    editor?.setEditable(!disabled)
  }, [editor, disabled])

  // Sync external value changes (e.g. an async preview load resolving) into the
  // editor without bouncing our own edits back through it.
  useEffect(() => {
    if (!editor || mode !== "rich") return
    if (value === lastEmitted.current) return
    editor.commands.setContent(toEditorHtml(value, blockTokens).html, { emitUpdate: false })
    lastEmitted.current = value
  }, [value, editor, mode, blockTokens])

  function switchToSource() {
    setSourceDraft(value)
    setMode("source")
  }

  function switchToRich() {
    // sourceDraft is authoritative; push it up, then re-seed the editor.
    emit(sourceDraft)
    editor?.commands.setContent(toEditorHtml(sourceDraft, blockTokens).html, { emitUpdate: false })
    setMode("rich")
  }

  function handleSourceChange(next: string) {
    setSourceDraft(next)
    emit(next)
  }

  const canGoRich = richSafe || canRoundTrip(sourceDraft, blockTokens)

  return (
    <div className="rounded-md border bg-background">
      <div className="flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1">
        {mode === "rich" && editor ? (
          <RichToolbar editor={editor} disabled={disabled} />
        ) : (
          <span className="px-2 text-xs text-muted-foreground">HTML source</span>
        )}
        <div className="ml-auto">
          {mode === "source" && !canGoRich ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Toggle size="sm" pressed disabled aria-label="Rich text unavailable">
                    <Code2 className="h-3.5 w-3.5" />
                  </Toggle>
                </span>
              </TooltipTrigger>
              <TooltipContent>This HTML is too complex for the visual editor.</TooltipContent>
            </Tooltip>
          ) : (
            <Toggle
              size="sm"
              pressed={mode === "source"}
              onPressedChange={(pressed) => (pressed ? switchToSource() : switchToRich())}
              disabled={disabled}
              aria-label="Toggle HTML source"
              aria-pressed={mode === "source"}
            >
              <Code2 className="h-3.5 w-3.5" />
              <span className="text-xs">HTML</span>
            </Toggle>
          )}
        </div>
      </div>

      {mode === "rich" ? (
        <EditorContent editor={editor} id={id} />
      ) : (
        <Textarea
          id={id}
          value={sourceDraft}
          onChange={(event) => handleSourceChange(event.target.value)}
          disabled={disabled}
          className="border-0 font-mono text-xs focus-visible:ring-0"
          style={{ minHeight }}
        />
      )}
    </div>
  )
}

interface RichToolbarProps {
  editor: NonNullable<ReturnType<typeof useEditor>>
  disabled: boolean
}

function RichToolbar({ editor, disabled }: RichToolbarProps) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState("")

  function applyLink() {
    const url = linkUrl.trim()
    if (url) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run()
    } else {
      editor.chain().focus().extendMarkRange("link").unsetLink().run()
    }
    setLinkOpen(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5">
      <Toggle
        size="sm"
        pressed={editor.isActive("bold")}
        onPressedChange={() => editor.chain().focus().toggleBold().run()}
        disabled={disabled}
        aria-label="Bold"
      >
        <Bold className="h-3.5 w-3.5" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive("italic")}
        onPressedChange={() => editor.chain().focus().toggleItalic().run()}
        disabled={disabled}
        aria-label="Italic"
      >
        <Italic className="h-3.5 w-3.5" />
      </Toggle>

      <Popover
        open={linkOpen}
        onOpenChange={(open) => {
          setLinkOpen(open)
          if (open) setLinkUrl(editor.getAttributes("link").href ?? "")
        }}
      >
        <PopoverTrigger asChild>
          <Toggle size="sm" pressed={editor.isActive("link")} disabled={disabled} aria-label="Link">
            <Link2 className="h-3.5 w-3.5" />
          </Toggle>
        </PopoverTrigger>
        <PopoverContent className="w-72 space-y-2" align="start">
          <Input
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            placeholder="https://example.com"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                applyLink()
              }
            }}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setLinkOpen(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={applyLink}>
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <Toggle
        size="sm"
        pressed={editor.isActive("bulletList")}
        onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
        disabled={disabled}
        aria-label="Bullet list"
      >
        <List className="h-3.5 w-3.5" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive("orderedList")}
        onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
        disabled={disabled}
        aria-label="Ordered list"
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </Toggle>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 w-8 p-0"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={disabled || !editor.can().undo()}
        aria-label="Undo"
      >
        <Undo2 className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 w-8 p-0"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={disabled || !editor.can().redo()}
        aria-label="Redo"
      >
        <Redo2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
