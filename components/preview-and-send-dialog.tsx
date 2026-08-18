"use client"

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { Paperclip, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { useOptimisticSend } from "@/hooks/use-optimistic-send"
import { EmailAttachmentPicker } from "@/components/email-attachment-picker"
import { SignaturePicker } from "@/components/signature-picker"
import { extractContentSlot, replaceContentSlot } from "@/lib/templates/content-slot"
import { replaceSignatureSlot } from "@/lib/templates/signature-slot"
import { useDirtyCloseGuard } from "@/hooks/use-dirty-close-guard"
import { DiscardChangesDialog } from "@/components/discard-changes-dialog"

const HtmlBodyEditor = dynamic(
  () => import("@/components/ui/html-body-editor").then((m) => m.HtmlBodyEditor),
  { ssr: false, loading: () => <Skeleton className="min-h-64" /> },
)

interface PreviewAndSendDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  bookingId: string
  initialSubject: string
  /** Full email HTML (branded wrapper). */
  bodyHtml: string
  /**
   * Editable inner content. When omitted, it is extracted from bodyHtml's
   * content-slot markers; if neither exists the Edit tab is hidden.
   */
  bodyContentHtml?: string
  kind: string
  moveStage?: string
  /** Initial recipient override; defaults to the customer's email server-side. */
  to?: string
  quoteId?: string
  voucherId?: string
  /** Scheduled correspondence row this send fulfils (updated in place server-side). */
  scheduledCorrespondenceId?: string
  /** Profile the embedded signature belongs to — may not be the logged-in user. */
  signatureProfileId?: string | null
  /** Brand compose originally resolved into the signature; the picker's initial selection. */
  signatureBrandId?: string | null
  attachments?: Array<{
    filename: string
    contentBase64: string
    contentType?: string
  }>
  onSent: () => Promise<void> | void
}

export function PreviewAndSendDialog({
  open,
  onOpenChange,
  title,
  description,
  bookingId,
  initialSubject,
  bodyHtml,
  bodyContentHtml,
  kind,
  moveStage,
  to,
  quoteId,
  voucherId,
  scheduledCorrespondenceId,
  signatureProfileId = null,
  signatureBrandId = null,
  attachments,
  onSent,
}: PreviewAndSendDialogProps) {
  const [subject, setSubject] = useState(initialSubject)
  const [recipient, setRecipient] = useState(to ?? "")
  const initialContent = useMemo(
    () => bodyContentHtml ?? extractContentSlot(bodyHtml),
    [bodyContentHtml, bodyHtml],
  )
  const [content, setContent] = useState<string | null>(initialContent)
  const [signatureHtml, setSignatureHtml] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [libraryAttachmentIds, setLibraryAttachmentIds] = useState<string[]>([])
  const optimisticSend = useOptimisticSend()

  const canEditBody = initialContent !== null
  const isDirty =
    subject !== initialSubject ||
    content !== initialContent ||
    recipient !== (to ?? "") ||
    libraryAttachmentIds.length > 0
  const closeGuard = useDirtyCloseGuard({
    isDirty,
    onConfirmedClose: () => onOpenChange(false),
  })

  // Splice the edited content back into the branded wrapper for live preview
  // and for the actual send, then swap in a picked signature. Both splices
  // are pure window replacements over disjoint regions, so they commute —
  // content innermost, signature after.
  const finalHtml = useMemo(() => {
    let out = bodyHtml
    if (canEditBody && content !== null) {
      const spliced = replaceContentSlot(out, content)
      if (spliced === null) return content
      out = spliced
    }
    if (signatureHtml !== null) out = replaceSignatureSlot(out, signatureHtml) ?? out
    return out
  }, [bodyHtml, canEditBody, content, signatureHtml])

  async function handleSend() {
    if (!subject.trim()) return
    setSending(true)
    const capturedSubject = subject
    const capturedHtml = finalHtml
    const capturedRecipient = recipient.trim()
    const capturedLibraryIds = libraryAttachmentIds
    // Close dialog immediately for Gmail-style undo flow. The send fires
    // ~5s later via the optimistic-send hook; if the user clicks Undo on
    // the toast, the fetch never runs.
    onOpenChange(false)
    setSending(false)

    const result = await optimisticSend({
      pendingLabel: `Sending ${kind} email...`,
      successLabel: "Email sent",
      cancelledLabel: "Send cancelled",
      perform: async () => {
        const response = await fetch("/api/correspondence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookingId,
            kind,
            subject: capturedSubject,
            bodyHtml: capturedHtml,
            moveStage,
            to: capturedRecipient || undefined,
            quoteId,
            voucherId,
            scheduledCorrespondenceId,
            sentAt: new Date().toISOString(),
            attachments,
            libraryAttachmentIds: capturedLibraryIds.length > 0 ? capturedLibraryIds : undefined,
          }),
        })
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        if (!response.ok) {
          throw new Error(payload?.error ?? "Email could not be sent")
        }
        return payload
      },
    })

    if (result.ok) {
      await onSent()
    }
  }

  const previewFrame = (
    <div className="max-h-[420px] overflow-auto rounded-md border bg-background">
      <iframe
        className="h-[420px] w-full bg-white"
        sandbox=""
        srcDoc={finalHtml}
        title="Email preview"
      />
    </div>
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (sending) return
        if (nextOpen) {
          onOpenChange(true)
          return
        }
        closeGuard.handleOpenChange(false)
      }}
    >
      <DialogContent className="sm:max-w-4xl" {...closeGuard.contentProps}>
        <DiscardChangesDialog
          open={closeGuard.confirming}
          onKeepEditing={closeGuard.cancelDiscard}
          onDiscard={closeGuard.confirmDiscard}
          description="This email hasn't been sent. Your edits will be lost."
        />
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="preview-send-subject">Subject</Label>
              <Input
                id="preview-send-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                disabled={sending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="preview-send-to">To</Label>
              <Input
                id="preview-send-to"
                type="email"
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder="Customer email (default)"
                disabled={sending}
              />
            </div>
          </div>

          {attachments && attachments.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {attachments.map((attachment) => (
                <span
                  key={attachment.filename}
                  className="inline-flex items-center gap-1 rounded-md border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                >
                  <Paperclip className="h-3 w-3" aria-hidden />
                  {attachment.filename}
                </span>
              ))}
            </div>
          )}

          <EmailAttachmentPicker
            bookingId={bookingId}
            kind={kind}
            selected={libraryAttachmentIds}
            onSelectedChange={setLibraryAttachmentIds}
            disabled={sending}
          />

          <SignaturePicker
            bodyHtml={bodyHtml}
            profileId={signatureProfileId}
            initialBrandId={signatureBrandId}
            onSignatureHtmlChange={setSignatureHtml}
            disabled={sending}
          />

          {canEditBody ? (
            <Tabs defaultValue="preview">
              <TabsList>
                <TabsTrigger value="preview">Preview</TabsTrigger>
                <TabsTrigger value="edit">Edit</TabsTrigger>
              </TabsList>
              <TabsContent value="preview">{previewFrame}</TabsContent>
              <TabsContent value="edit">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="preview-send-body" className="sr-only">
                    Email body (HTML)
                  </Label>
                  <HtmlBodyEditor
                    id="preview-send-body"
                    value={content ?? ""}
                    onChange={setContent}
                    disabled={sending}
                  />
                  <p className="text-xs text-muted-foreground">
                    Edits apply to this email only. Change the default wording on the Templates page.
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            previewFrame
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => closeGuard.handleOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || !subject.trim()}>
            <Send data-icon="inline-start" />
            {sending
              ? "Sending..."
              : (attachments?.length ?? 0) + libraryAttachmentIds.length > 0
                ? "Send with attachment"
                : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
