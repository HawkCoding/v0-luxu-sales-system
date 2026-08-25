"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Loader2,
  Mail,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Send,
} from "lucide-react"
import { toast } from "sonner"
import { QUOTE_REFERENCE_ENABLED } from "@/lib/feature-flags"
import { Button } from "@/components/ui/button"
import { useOptimisticSend } from "@/hooks/use-optimistic-send"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import dynamic from "next/dynamic"
import { EmailAttachmentPicker } from "@/components/email-attachment-picker"
import { SignaturePicker } from "@/components/signature-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { formatMoney } from "@/lib/money"
import { replaceContentSlot } from "@/lib/templates/content-slot"
import { replaceSignatureSlot } from "@/lib/templates/signature-slot"
import { formatQuoteDisplayLabel } from "@/lib/quotes/quote-number"
import { useDirtyCloseGuard } from "@/hooks/use-dirty-close-guard"
import { DiscardChangesDialog } from "@/components/discard-changes-dialog"

/** In-memory only -- compared against `serverBaseline` to detect unsent edits for the
 *  discard-on-close prompt. Never persisted (see the removed localStorage autosave: ticking an
 *  attachment before the preview landed could write `content: null`, which then hid the body
 *  editor on every future reopen for that quote). */
interface ComposerState {
  subject: string
  content: string | null
  libraryAttachmentIds: string[]
}

const HtmlBodyEditor = dynamic(
  () => import("@/components/ui/html-body-editor").then((m) => m.HtmlBodyEditor),
  { ssr: false, loading: () => <Skeleton className="min-h-64" /> },
)
import type { Quote } from "@/lib/types"

interface QuotePreviewSendDialogProps {
  quote: Quote
  bookingNumber: string
  customerName: string
  emailImportNeedsReview?: boolean
  onSent: () => void
  /** Controlled mode: when provided, the dialog renders no trigger button. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

interface QuoteConfigPreview {
  primarySupplierId: string | null
  primarySupplierName: string | null
  journeyClass: "short" | "long" | null
  rateAudience: "international" | "resident"
  trainOnly: boolean
  auto: { journeyClass: boolean; rateAudience: boolean; trainOnly: boolean }
  unresolved: string[]
}

interface PreviewResponse {
  html?: string
  bodyContentHtml?: string
  subject?: string
  quoteNumber?: string
  warnings?: string[]
  signatureProfileId?: string | null
  signatureBrandId?: string | null
  config?: QuoteConfigPreview
  error?: string
}

type PaneView = "both" | "editor" | "preview"

function ConfigToggleRow({
  label,
  value,
  auto,
  disabled,
  options,
  onChange,
}: {
  label: string
  value: string | null
  auto: boolean
  disabled: boolean
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-foreground">
        {label}
        {auto && (
          <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
            Auto
          </span>
        )}
      </span>
      <div className="flex overflow-hidden rounded-md border">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "px-2 py-1 text-xs transition-colors",
              value === option.value
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function QuotePreviewSendDialog({
  quote,
  bookingNumber,
  emailImportNeedsReview = false,
  onSent,
  open: controlledOpen,
  onOpenChange,
}: QuotePreviewSendDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const [pane, setPane] = useState<PaneView>("both")
  const [subject, setSubject] = useState("")
  const [html, setHtml] = useState("")
  const [content, setContent] = useState<string | null>(null)
  const [signatureHtml, setSignatureHtml] = useState<string | null>(null)
  const [signatureProfileId, setSignatureProfileId] = useState<string | null>(null)
  const [signatureBrandId, setSignatureBrandId] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [libraryAttachmentIds, setLibraryAttachmentIds] = useState<string[]>([])
  const [config, setConfig] = useState<QuoteConfigPreview | null>(null)
  const [savingConfig, setSavingConfig] = useState(false)
  const optimisticSend = useOptimisticSend()
  // What the server last rendered, so a hand-edit can be told apart from the template's own wording
  // -- reopening this dialog re-fetches the preview (moveStage/signature defaults can have changed),
  // and that used to silently overwrite whatever was typed the first time.
  const [serverBaseline, setServerBaseline] = useState<ComposerState>({
    subject: "",
    content: null,
    libraryAttachmentIds: [],
  })
  const isDirty =
    JSON.stringify({ subject, content, libraryAttachmentIds }) !== JSON.stringify(serverBaseline)

  function setOpen(next: boolean) {
    if (!isControlled) setInternalOpen(next)
    onOpenChange?.(next)
  }

  const closeGuard = useDirtyCloseGuard({
    isDirty,
    onConfirmedClose: () => setOpen(false),
  })

  // The email is composed server-side from the quote_email template; edits
  // here are spliced into the branded wrapper for this send only. Content
  // splices innermost, signature after — the two slots are disjoint regions
  // so the splices commute.
  const finalHtml = useMemo(() => {
    if (!html) return ""
    let out = html
    if (content !== null) out = replaceContentSlot(out, content) ?? content
    if (signatureHtml !== null) out = replaceSignatureSlot(out, signatureHtml) ?? out
    return out
  }, [html, content, signatureHtml])

  async function loadPreview() {
    setLoadingPreview(true)
    setError(null)
    setSignatureHtml(null)

    try {
      const response = await fetch(`/api/quotes/${quote.id}/email-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const payload = (await response.json()) as PreviewResponse

      if (!response.ok || !payload.html) {
        throw new Error(payload.error ?? "Failed to render quote preview")
      }

      setHtml(payload.html)
      setSignatureProfileId(payload.signatureProfileId ?? null)
      setSignatureBrandId(payload.signatureBrandId ?? null)
      // Customer-facing fallback when the template resolves no subject, so it
      // follows the same reference rule as the quote email and PDF.
      const subjectReference = QUOTE_REFERENCE_ENABLED
        ? payload.quoteNumber ?? bookingNumber
        : bookingNumber
      const renderedSubject = payload.subject?.trim() ? payload.subject : `Quote ${subjectReference}`
      const renderedContent = payload.bodyContentHtml ?? null
      setServerBaseline({ subject: renderedSubject, content: renderedContent, libraryAttachmentIds: [] })

      // Subject always comes from the current template render -- reopening the dialog always
      // starts from a clean server render, never from anything left over from a previous open.
      setSubject(renderedSubject)
      setContent(renderedContent)
      setLibraryAttachmentIds([])
      setWarnings(payload.warnings ?? [])
      setConfig(payload.config ?? null)
    } catch (previewError) {
      const message = previewError instanceof Error ? previewError.message : "Failed to render quote preview"
      setError(message)
    } finally {
      setLoadingPreview(false)
    }
  }

  /** Flips one config axis and re-renders the preview so the email, and the PDF it will attach,
   * agree with what the panel now shows. The other two axes keep whatever they were (Auto or an
   * existing override) — only the touched axis becomes an explicit override. */
  async function updateConfig(
    patch: Partial<{ journeyClass: "short" | "long" | null; rateAudience: "international" | "resident" | null; showTrainOnlyNote: boolean | null }>,
  ) {
    if (!config) return
    const body = {
      journeyClass: config.auto.journeyClass ? null : config.journeyClass,
      rateAudience: config.auto.rateAudience ? null : config.rateAudience,
      showTrainOnlyNote: config.auto.trainOnly ? null : config.trainOnly,
      ...patch,
    }
    setSavingConfig(true)
    try {
      const response = await fetch(`/api/quotes/${quote.id}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error ?? "Failed to save quote configuration")
      }
      await loadPreview()
    } catch (configError) {
      toast.error(configError instanceof Error ? configError.message : "Failed to save quote configuration")
    } finally {
      setSavingConfig(false)
    }
  }

  useEffect(() => {
    if (open) {
      void loadPreview()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, quote.id])

  async function handleSend() {
    if (emailImportNeedsReview) {
      toast.error("Resolve Needs Review before sending this quote")
      return
    }

    if (config && config.unresolved.length > 0) {
      toast.error(config.unresolved[0] ?? "This quote needs configuration before it can be sent")
      return
    }

    if (!finalHtml) {
      setError("Preview the quote email before sending.")
      return
    }

    setSending(true)
    setError(null)

    const capturedSubject = subject
    const capturedHtml = finalHtml
    const capturedLibraryIds = libraryAttachmentIds
    // Close dialog immediately for Gmail-style undo flow.
    setOpen(false)
    setSending(false)

    const result = await optimisticSend({
      pendingLabel: `Sending ${formatQuoteDisplayLabel(quote.quoteNumber)}...`,
      successLabel: "Quote sent",
      cancelledLabel: "Send cancelled",
      perform: async () => {
        const response = await fetch("/api/correspondence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookingId: quote.jobId,
            quoteId: quote.id,
            channel: "email",
            kind: "quote",
            subject: capturedSubject,
            bodyHtml: capturedHtml,
            moveStage: "quote_sent",
            libraryAttachmentIds: capturedLibraryIds.length > 0 ? capturedLibraryIds : undefined,
          }),
        })
        const payload = (await response.json()) as { error?: string }
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to send quote")
        }
        return payload
      },
    })

    if (result.ok) {
      onSent()
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : closeGuard.handleOpenChange(false))}>
      {!isControlled && (
        <DialogTrigger asChild>
          <Button size="sm" variant={quote.status === "sent" ? "outline" : "default"}>
            <Mail className="mr-1.5 h-3.5 w-3.5" />
            Preview & Send
          </Button>
        </DialogTrigger>
      )}
      <DialogContent
        className="flex h-[90vh] max-h-[90vh] flex-col overflow-hidden max-w-[95vw] sm:max-w-[95vw] xl:max-w-6xl"
        {...closeGuard.contentProps}
      >
        <DiscardChangesDialog
          open={closeGuard.confirming}
          onKeepEditing={closeGuard.cancelDiscard}
          onDiscard={closeGuard.confirmDiscard}
        />
        <DialogHeader>
          <DialogTitle>Preview & Send Quote</DialogTitle>
          <DialogDescription>
            Review the customer email before sending {formatQuoteDisplayLabel(quote.quoteNumber)}. The
            quote PDF is attached automatically.
          </DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            "grid min-h-0 flex-1 gap-4 overflow-y-auto md:overflow-hidden",
            pane === "both" && "md:grid-cols-[minmax(340px,420px)_1fr]",
          )}
        >
          <div className={cn("flex min-h-0 flex-col", pane === "preview" && "hidden")}>
            <div className="flex items-center justify-between pb-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Compose
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => setPane(pane === "both" ? "preview" : "both")}
                title={pane === "both" ? "Collapse editor" : "Show preview"}
              >
                {pane === "both" ? (
                  <PanelLeftClose className="h-4 w-4" />
                ) : (
                  <PanelRightOpen className="h-4 w-4" />
                )}
                <span className="sr-only">{pane === "both" ? "Collapse editor" : "Show preview"}</span>
              </Button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 md:overflow-y-auto md:pr-1">
              <div className="space-y-1 text-right">
                <div className="flex justify-end gap-8 text-xs">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="text-foreground font-medium w-28">
                    {formatMoney(quote.subtotal, quote.currency)}
                  </span>
                </div>
                <div className="flex justify-end gap-8 text-sm font-semibold">
                  <span className="text-foreground">Total</span>
                  <span className="text-foreground w-28">{formatMoney(quote.total, quote.currency)}</span>
                </div>
              </div>
              {config && (config.primarySupplierId || config.unresolved.length > 0) && (
                <div className="space-y-2 rounded-md border p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                      This quote
                    </span>
                    {savingConfig && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  </div>
                  {config.primarySupplierName && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Train</span>
                      <span className="font-medium">{config.primarySupplierName}</span>
                    </div>
                  )}
                  {(config.journeyClass !== null || config.unresolved.length > 0) && (
                    <ConfigToggleRow
                      label="Journey"
                      auto={config.auto.journeyClass}
                      disabled={savingConfig}
                      options={[
                        { value: "short", label: "Short" },
                        { value: "long", label: "Long" },
                      ]}
                      value={config.journeyClass}
                      onChange={(value) => void updateConfig({ journeyClass: value as "short" | "long" })}
                    />
                  )}
                  <ConfigToggleRow
                    label="Rate"
                    auto={config.auto.rateAudience}
                    disabled={savingConfig}
                    options={[
                      { value: "international", label: "Intl" },
                      { value: "resident", label: "Local" },
                    ]}
                    value={config.rateAudience}
                    onChange={(value) => void updateConfig({ rateAudience: value as "international" | "resident" })}
                  />
                  <label className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-foreground">
                      Train-only note
                      {config.auto.trainOnly && (
                        <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                          Auto
                        </span>
                      )}
                    </span>
                    <input
                      type="checkbox"
                      checked={config.trainOnly}
                      disabled={savingConfig}
                      onChange={(event) => void updateConfig({ showTrainOnlyNote: event.target.checked })}
                      className="h-3.5 w-3.5"
                    />
                  </label>
                  {config.unresolved.length > 0 && (
                    <p className="rounded bg-destructive/10 px-2 py-1 text-destructive">
                      {config.unresolved[0]}
                    </p>
                  )}
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor={`quote-subject-${quote.id}`}>Subject</Label>
                <Input
                  id={`quote-subject-${quote.id}`}
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                />
              </div>
              <EmailAttachmentPicker
                bookingId={quote.jobId}
                kind="quote"
                selected={libraryAttachmentIds}
                onSelectedChange={setLibraryAttachmentIds}
                disabled={sending}
              />
              <SignaturePicker
                bodyHtml={html}
                profileId={signatureProfileId}
                initialBrandId={signatureBrandId}
                onSignatureHtmlChange={setSignatureHtml}
                disabled={sending}
              />
              {content !== null && (
                <div className="space-y-1.5">
                  <Label htmlFor={`quote-body-${quote.id}`}>Email body (this send only)</Label>
                  <HtmlBodyEditor
                    id={`quote-body-${quote.id}`}
                    value={content}
                    onChange={setContent}
                  />
                  <p className="text-xs text-muted-foreground">
                    Default wording is edited on the Templates page (Quote Email template).
                  </p>
                </div>
              )}
              {warnings.length > 0 && (
                <div className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400" role="alert">
                  {warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              )}
              {error ? (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
          </div>

          <div className={cn("flex min-h-0 flex-col", pane === "editor" && "hidden")}>
            <div className="flex items-center justify-between pb-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Preview
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => setPane(pane === "both" ? "editor" : "both")}
                title={pane === "both" ? "Collapse preview" : "Show editor"}
              >
                {pane === "both" ? (
                  <PanelRightClose className="h-4 w-4" />
                ) : (
                  <PanelLeftOpen className="h-4 w-4" />
                )}
                <span className="sr-only">{pane === "both" ? "Collapse preview" : "Show editor"}</span>
              </Button>
            </div>
            <div className="min-h-[320px] flex-1 overflow-hidden rounded-md border bg-white">
              {loadingPreview ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Rendering preview...
                </div>
              ) : finalHtml ? (
                <iframe
                  title="Quote email preview"
                  className="h-[420px] w-full bg-white md:h-full"
                  sandbox=""
                  srcDoc={finalHtml}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No preview available
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => closeGuard.handleOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={
              sending ||
              loadingPreview ||
              !finalHtml ||
              !subject.trim() ||
              Boolean(config && config.unresolved.length > 0)
            }
          >
            {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
