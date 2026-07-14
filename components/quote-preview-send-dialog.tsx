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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { replaceContentSlot } from "@/lib/templates/content-slot"

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

interface PreviewResponse {
  html?: string
  bodyContentHtml?: string
  subject?: string
  quoteNumber?: string
  warnings?: string[]
  error?: string
}

type PaneView = "both" | "editor" | "preview"

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
  const [warnings, setWarnings] = useState<string[]>([])
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const optimisticSend = useOptimisticSend()

  function setOpen(next: boolean) {
    if (!isControlled) setInternalOpen(next)
    onOpenChange?.(next)
  }

  // The email is composed server-side from the quote_email template; edits
  // here are spliced into the branded wrapper for this send only.
  const finalHtml = useMemo(() => {
    if (!html) return ""
    if (content === null) return html
    return replaceContentSlot(html, content) ?? content
  }, [html, content])

  async function loadPreview() {
    setLoadingPreview(true)
    setError(null)

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
      setContent(payload.bodyContentHtml ?? null)
      setSubject(payload.subject ?? `Quote ${payload.quoteNumber ?? bookingNumber}`)
      setWarnings(payload.warnings ?? [])
    } catch (previewError) {
      const message = previewError instanceof Error ? previewError.message : "Failed to render quote preview"
      setError(message)
    } finally {
      setLoadingPreview(false)
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

    if (!finalHtml) {
      setError("Preview the quote email before sending.")
      return
    }

    setSending(true)
    setError(null)

    const capturedSubject = subject
    const capturedHtml = finalHtml
    // Close dialog immediately for Gmail-style undo flow.
    setOpen(false)
    setSending(false)

    const result = await optimisticSend({
      pendingLabel: `Sending quote ${quote.quoteNumber || bookingNumber}...`,
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
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger asChild>
          <Button size="sm" variant={quote.status === "sent" ? "outline" : "default"}>
            <Mail className="mr-1.5 h-3.5 w-3.5" />
            Preview & Send
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="flex h-[90vh] max-h-[90vh] flex-col overflow-hidden max-w-[95vw] sm:max-w-[95vw] xl:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Preview & Send Quote</DialogTitle>
          <DialogDescription>
            Review the customer email before sending {quote.quoteNumber || bookingNumber}. The quote
            PDF is attached automatically.
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
              <div className="space-y-1.5">
                <Label htmlFor={`quote-subject-${quote.id}`}>Subject</Label>
                <Input
                  id={`quote-subject-${quote.id}`}
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                />
              </div>
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
          <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || loadingPreview || !finalHtml}>
            {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
