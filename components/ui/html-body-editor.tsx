"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useEditor, useEditorState, EditorContent } from "@tiptap/react"
import {
  Bold,
  Italic,
  Underline,
  Link2,
  List,
  ListOrdered,
  Redo2,
  Undo2,
  Code2,
  Baseline,
  Highlighter,
  Ban,
  PlusCircle,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Toggle } from "@/components/ui/toggle"
import { Separator } from "@/components/ui/separator"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { buildEditorExtensions } from "@/lib/templates/rich-text/editor-extensions"
import { toEditorHtml, fromEditorHtml, canRoundTrip } from "@/lib/templates/rich-text/serialize"
import {
  EMAIL_INLINE_FONT_SIZE_OPTIONS,
  isEmailInlineFontSize,
  EMAIL_FONT_FAMILY_OPTIONS,
  EMAIL_FONT_FAMILY_LABELS,
  toEmailInlineFontFamily,
  toEmailFontFamily,
  EMAIL_TEXT_COLOR_OPTIONS,
  EMAIL_TEXT_COLOR_LABELS,
  toEmailTextColor,
  EMAIL_HIGHLIGHT_COLOR_OPTIONS,
  EMAIL_HIGHLIGHT_COLOR_LABELS,
  toEmailHighlightColor,
  isHexColor,
} from "@/lib/email/appearance"

/** A `{{token}}` the "Insert field" dropdown can splice into the document. */
export interface HtmlBodyEditorInsertToken {
  token: string
  label: string
}

export interface HtmlBodyEditorProps {
  value: string
  onChange: (html: string) => void
  /** Names of block-kind tokens ({{name}}) to treat as opaque blocks. */
  blockTokens?: string[]
  disabled?: boolean
  minHeight?: string
  id?: string
  /** The email's actual base size (Settings → Email Appearance). Sets the editable
   *  area's preview size, and labels the size dropdown's unset option (e.g. "16px")
   *  instead of the word "Default". */
  baseFontSize?: string
  /** The email's actual base font family (Settings → Email Appearance), used to
   *  label the family dropdown's unset option (e.g. "Arial") instead of "Default". */
  baseFontFamily?: string
  /** "compact" drops the list buttons and shrinks minHeight — for short single-line/paragraph fields (e.g. a signature line) rather than a full email body. */
  variant?: "full" | "compact"
  /** Fires when the editable area loses focus — save-on-blur callers don't need to debounce onChange. */
  onBlur?: () => void
  /** When set, adds an "Insert field" dropdown that splices `{{token}}` at the cursor. */
  insertTokens?: HtmlBodyEditorInsertToken[]
}

type Mode = "rich" | "source"

const EMPTY_BLOCK_TOKENS: string[] = []

export function HtmlBodyEditor({
  value,
  onChange,
  blockTokens = EMPTY_BLOCK_TOKENS,
  disabled = false,
  minHeight,
  id,
  baseFontSize,
  baseFontFamily,
  variant = "full",
  onBlur,
  insertTokens,
}: HtmlBodyEditorProps) {
  const resolvedMinHeight = minHeight ?? (variant === "compact" ? "4rem" : "16rem")
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
        style: `min-height:${resolvedMinHeight}${baseFontSize ? `;font-size:${baseFontSize}` : ""}`,
      },
      handleDOMEvents: onBlur
        ? {
            blur: () => {
              onBlur()
              return false
            },
          }
        : undefined,
    },
    onUpdate: ({ editor }) => {
      emit(fromEditorHtml(editor.getHTML()))
    },
  })

  useEffect(() => {
    editor?.setEditable(!disabled)
  }, [editor, disabled])

  // baseFontSize can arrive after the editor mounts (an SWR fetch resolving),
  // so it's applied imperatively rather than baked into editorProps at creation.
  useEffect(() => {
    if (!editor) return
    editor.view.dom.style.fontSize = baseFontSize ?? ""
  }, [editor, baseFontSize])

  // Sync external value changes (e.g. an async preview load resolving) into the
  // editor without bouncing our own edits back through it.
  useEffect(() => {
    if (!editor || mode !== "rich") return
    if (value === lastEmitted.current) return
    // Deferred to a microtask: Tiptap's internal flushSync can't run while
    // React is still mid-commit from the state update that triggered this effect.
    queueMicrotask(() => {
      editor.commands.setContent(toEditorHtml(value, blockTokens).html, { emitUpdate: false })
      lastEmitted.current = value
    })
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
          <RichToolbar
            editor={editor}
            disabled={disabled}
            baseFontSize={baseFontSize}
            baseFontFamily={baseFontFamily}
            variant={variant}
            insertTokens={insertTokens}
          />
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
          style={{ minHeight: resolvedMinHeight }}
        />
      )}
    </div>
  )
}

interface RichToolbarProps {
  editor: NonNullable<ReturnType<typeof useEditor>>
  disabled: boolean
  /** The email's actual base size, shown as the "unset" option's label so it
   *  reads as a real number instead of the word "Default". */
  baseFontSize?: string
  /** The email's actual base font family, shown (as its short label, e.g. "Arial")
   *  as the family dropdown's "unset" option instead of the word "Default". */
  baseFontFamily?: string
  variant?: "full" | "compact"
  insertTokens?: HtmlBodyEditorInsertToken[]
}

const DEFAULT_FONT_SIZE_VALUE = "default"

function RichToolbar({
  editor,
  disabled,
  baseFontSize,
  baseFontFamily,
  variant = "full",
  insertTokens,
}: RichToolbarProps) {
  const defaultFontFamilyLabel = baseFontFamily
    ? EMAIL_FONT_FAMILY_LABELS[toEmailFontFamily(baseFontFamily)]
    : "Default"
  const defaultFontSizeLabel = baseFontSize ?? "Default"
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState("")

  // Selector result is compared shallowly, so this only re-renders the
  // toolbar (not the whole document) when the cursor moves onto/off a sized
  // span — plain typing inside one span doesn't change the attribute.
  const activeFontSize = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const raw = e.getAttributes("textStyle").fontSize as string | undefined
      return isEmailInlineFontSize(raw) ? raw : DEFAULT_FONT_SIZE_VALUE
    },
  })

  function applyFontSize(value: string) {
    if (value === DEFAULT_FONT_SIZE_VALUE) {
      editor.chain().focus().unsetFontSize().run()
    } else {
      editor.chain().focus().setFontSize(value).run()
    }
  }

  // toEmailInlineFontFamily normalizes the DOM's quote-canonicalized style
  // value back to our single-quoted canonical option (see appearance.ts).
  const activeFontFamily = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      toEmailInlineFontFamily(e.getAttributes("textStyle").fontFamily as string | undefined) ?? DEFAULT_FONT_SIZE_VALUE,
  })

  function applyFontFamily(value: string) {
    if (value === DEFAULT_FONT_SIZE_VALUE) {
      editor.chain().focus().unsetFontFamily().run()
    } else {
      editor.chain().focus().setFontFamily(value).run()
    }
  }

  // toEmailTextColor/toEmailHighlightColor normalize to our canonical hex
  // swatch even when the DOM has already canonicalized the stored value to
  // rgb(r, g, b) — which it does for any color touched via contenteditable,
  // including our own toolbar's own setColor/setBackgroundColor calls once
  // the content round-trips through a save/reload.
  const activeTextColor = useEditorState({
    editor,
    selector: ({ editor: e }) => toEmailTextColor(e.getAttributes("textStyle").color as string | undefined),
  })

  const activeHighlightColor = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      toEmailHighlightColor(e.getAttributes("textStyle").backgroundColor as string | undefined),
  })

  function applyTextColor(hex: string | null) {
    if (hex === null) editor.chain().focus().unsetColor().run()
    else editor.chain().focus().setColor(hex).run()
  }

  function applyHighlightColor(hex: string | null) {
    if (hex === null) editor.chain().focus().unsetBackgroundColor().run()
    else editor.chain().focus().setBackgroundColor(hex).run()
  }

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
      <Toggle
        size="sm"
        pressed={editor.isActive("underline")}
        onPressedChange={() => editor.chain().focus().toggleUnderline().run()}
        disabled={disabled}
        aria-label="Underline"
      >
        <Underline className="h-3.5 w-3.5" />
      </Toggle>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <Select value={activeFontFamily} onValueChange={applyFontFamily} disabled={disabled}>
        <SelectTrigger size="sm" className="h-8 w-[7rem] px-2 text-xs" aria-label="Font family">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT_FONT_SIZE_VALUE}>{defaultFontFamilyLabel}</SelectItem>
          {EMAIL_FONT_FAMILY_OPTIONS.map((family) => (
            <SelectItem key={family} value={family}>
              {EMAIL_FONT_FAMILY_LABELS[family]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={activeFontSize} onValueChange={applyFontSize} disabled={disabled}>
        <SelectTrigger size="sm" className="h-8 w-[4.5rem] px-2 text-xs" aria-label="Font size">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT_FONT_SIZE_VALUE}>{defaultFontSizeLabel}</SelectItem>
          {EMAIL_INLINE_FONT_SIZE_OPTIONS.map((size) => (
            <SelectItem key={size} value={size}>
              {size}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ColorSwatchPopover
        icon={Baseline}
        label="Text color"
        swatches={EMAIL_TEXT_COLOR_OPTIONS}
        swatchLabels={EMAIL_TEXT_COLOR_LABELS}
        active={activeTextColor}
        onSelect={applyTextColor}
        disabled={disabled}
      />
      <ColorSwatchPopover
        icon={Highlighter}
        label="Highlight color"
        swatches={EMAIL_HIGHLIGHT_COLOR_OPTIONS}
        swatchLabels={EMAIL_HIGHLIGHT_COLOR_LABELS}
        active={activeHighlightColor}
        onSelect={applyHighlightColor}
        disabled={disabled}
      />

      <Separator orientation="vertical" className="mx-1 h-5" />

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

      {variant === "full" && (
        <>
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
        </>
      )}

      {insertTokens && insertTokens.length > 0 && (
        <>
          <Separator orientation="vertical" className="mx-1 h-5" />
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" size="sm" variant="ghost" className="h-8 gap-1 px-2 text-xs" disabled={disabled}>
                <PlusCircle className="h-3.5 w-3.5" />
                Insert field
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-1" align="start">
              {insertTokens.map(({ token, label }) => (
                <button
                  key={token}
                  type="button"
                  className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-secondary"
                  onClick={() => editor.chain().focus().insertContent(`{{${token}}}`).run()}
                >
                  {label}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </>
      )}

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

interface ColorSwatchPopoverProps {
  icon: LucideIcon
  label: string
  swatches: readonly string[]
  swatchLabels: Record<string, string>
  active: string | null
  onSelect: (hex: string | null) => void
  disabled: boolean
}

/** Shared icon-button-with-swatch-grid control for text colour and highlight. */
function ColorSwatchPopover({
  icon: Icon,
  label,
  swatches,
  swatchLabels,
  active,
  onSelect,
  disabled,
}: ColorSwatchPopoverProps) {
  const [open, setOpen] = useState(false)
  const [customHex, setCustomHex] = useState("")
  const [customError, setCustomError] = useState(false)

  function choose(hex: string | null) {
    onSelect(hex)
    setOpen(false)
  }

  function applyCustomHex() {
    const trimmed = customHex.trim()
    const candidate = trimmed.startsWith("#") ? trimmed : `#${trimmed}`
    if (!isHexColor(candidate)) {
      setCustomError(true)
      return
    }
    choose(candidate.toLowerCase())
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setCustomHex("")
          setCustomError(false)
        }
      }}
    >
      <PopoverTrigger asChild>
        <Toggle size="sm" pressed={active !== null} disabled={disabled} aria-label={label}>
          <span className="flex flex-col items-center gap-0.5">
            <Icon className="h-3.5 w-3.5" />
            <span
              className="block h-0.5 w-3.5 rounded-full"
              style={{ backgroundColor: active ?? "var(--muted-foreground)" }}
            />
          </span>
        </Toggle>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-2" align="start">
        <div className="grid grid-cols-4 gap-1.5">
          {swatches.map((hex) => (
            <button
              key={hex}
              type="button"
              aria-label={swatchLabels[hex] ?? hex}
              onClick={() => choose(hex)}
              className={cn(
                "h-6 w-6 rounded border border-border",
                active === hex && "ring-2 ring-offset-1 ring-ring",
              )}
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-6 w-6 shrink-0 rounded border border-border"
            style={{ backgroundColor: isHexColor(customHex.startsWith("#") ? customHex : `#${customHex}`) ? customHex : "transparent" }}
          />
          <Input
            value={customHex}
            onChange={(e) => {
              setCustomHex(e.target.value)
              setCustomError(false)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                applyCustomHex()
              }
            }}
            placeholder="#RRGGBB"
            aria-label={`Custom ${label.toLowerCase()} hex`}
            maxLength={7}
            className="h-6 flex-1 px-1.5 text-xs"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={applyCustomHex}
            disabled={customHex.trim() === ""}
          >
            Apply
          </Button>
        </div>
        {customError && <p className="mt-1 text-[11px] text-destructive">Enter a valid hex, e.g. #4a90d9</p>}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 h-7 w-full justify-start gap-1.5 px-1.5 text-xs"
          onClick={() => choose(null)}
        >
          <Ban className="h-3 w-3" />
          Default
        </Button>
      </PopoverContent>
    </Popover>
  )
}
