"use client"

import { useEffect, useState } from "react"
import { Loader2, Mail, RotateCcw, Send } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Quote } from "@/lib/types"

interface QuotePreviewSendDialogProps {
  quote: Quote
  bookingNumber: string
  customerName: string
  emailImportNeedsReview?: boolean
  onSent: () => void
}

interface PreviewResponse {
  html?: string
  subject?: string
  introText?: string
  quoteNumber?: string
  error?: string
}

const DEFAULT_INTRO =
  "Thank you for your enquiry. We are pleased to share your Luxus Travel & Tours quote for review."

export function QuotePreviewSendDialog({
  quote,
  bookingNumber,
  customerName,
  emailImportNeedsReview = false,
  onSent,
}: QuotePreviewSendDialogProps) {
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState("")
  const [introText, setIntroText] = useState(DEFAULT_INTRO)
  const [html, setHtml] = useState("")
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadPreview(nextIntroText = introText, nextSubject = subject) {
    setLoadingPreview(true)
    setError(null)

    try {
      const response = await fetch(`/api/quotes/${quote.id}/email-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          introText: nextIntroText,
          subject: nextSubject || undefined,
        }),
      })
      const payload = (await response.json()) as PreviewResponse

      if (!response.ok || !payload.html) {
        throw new Error(payload.error ?? "Failed to render quote preview")
      }

      setHtml(payload.html)
      setSubject(payload.subject ?? nextSubject)
      setIntroText(payload.introText ?? nextIntroText)
    } catch (previewError) {
      const message = previewError instanceof Error ? previewError.message : "Failed to render quote preview"
      setError(message)
    } finally {
      setLoadingPreview(false)
    }
  }

  useEffect(() => {
    if (open) {
      const quoteNumber = quote.quoteNumber || bookingNumber
      const nextSubject = `Quote ${quoteNumber} - Luxus Travel & Tours`
      setSubject(nextSubject)
      setIntroText(DEFAULT_INTRO)
      void loadPreview(DEFAULT_INTRO, nextSubject)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, quote.id])

  async function handleRefreshPreview() {
    await loadPreview(introText, subject)
  }

  async function handleSend() {
    if (emailImportNeedsReview) {
      toast.error("Resolve Needs Review before sending this quote")
      return
    }

    if (!html) {
      setError("Preview the quote email before sending.")
      return
    }

    setSending(true)
    setError(null)

    try {
      const response = await fetch("/api/correspondence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: quote.jobId,
          quoteId: quote.id,
          channel: "email",
          kind: "quote",
          subject,
          bodyHtml: html,
          moveStage: "quote_sent",
        }),
      })
      const payload = (await response.json()) as { error?: string }

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to send quote")
      }

      toast.success("Quote sent")
      setOpen(false)
      onSent()
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Failed to send quote"
      setError(message)
      toast.error(message)
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={quote.status === "sent" ? "outline" : "default"}>
          <Mail className="mr-1.5 h-3.5 w-3.5" />
          Preview & Send
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Preview & Send Quote</DialogTitle>
          <DialogDescription>
            Review the customer email before sending {quote.quoteNumber || bookingNumber}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-4 md:grid-cols-[320px_1fr]">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`quote-subject-${quote.id}`}>Subject</Label>
              <Input
                id={`quote-subject-${quote.id}`}
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`quote-intro-${quote.id}`}>Intro text</Label>
              <Textarea
                id={`quote-intro-${quote.id}`}
                className="min-h-40"
                value={introText}
                onChange={(event) => setIntroText(event.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleRefreshPreview}
              disabled={loadingPreview || sending}
            >
              {loadingPreview ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="mr-1.5 h-4 w-4" />
              )}
              Refresh Preview
            </Button>
            {error ? (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          <div className="min-h-[420px] overflow-hidden rounded-md border bg-white">
            {loadingPreview ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Rendering preview...
              </div>
            ) : html ? (
              <iframe
                title="Quote email preview"
                className="h-[60vh] w-full bg-white"
                sandbox=""
                srcDoc={html}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No preview available
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || loadingPreview || !html}>
            {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
