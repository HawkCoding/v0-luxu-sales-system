"use client"

import { useState } from "react"
import { Send } from "lucide-react"
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
import { useOptimisticSend } from "@/hooks/use-optimistic-send"

interface PreviewAndSendDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  bookingId: string
  initialSubject: string
  bodyHtml: string
  kind: string
  moveStage?: string
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
  kind,
  moveStage,
  attachments,
  onSent,
}: PreviewAndSendDialogProps) {
  const [subject, setSubject] = useState(initialSubject)
  const [sending, setSending] = useState(false)
  const optimisticSend = useOptimisticSend()

  async function handleSend() {
    if (!subject.trim()) return
    setSending(true)
    const capturedSubject = subject
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
            bodyHtml,
            moveStage,
            sentAt: new Date().toISOString(),
            attachments,
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

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !sending && onOpenChange(nextOpen)}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="preview-send-subject">Subject</Label>
            <Input
              id="preview-send-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              disabled={sending}
            />
          </div>
          <div className="max-h-[420px] overflow-auto rounded-md border bg-background">
            <iframe
              className="h-[420px] w-full bg-white"
              sandbox=""
              srcDoc={bodyHtml}
              title="Email preview"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || !subject.trim()}>
            <Send data-icon="inline-start" />
            {sending ? "Sending..." : attachments?.length ? "Send with attachment" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
