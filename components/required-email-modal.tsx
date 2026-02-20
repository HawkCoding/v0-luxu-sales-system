"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Mail, AlertCircle } from "lucide-react"
import { useState } from "react"

export interface RequiredEmail {
  type: "invoice" | "reservation" | "voucher"
  stageName: string
  subject: string
  bodyPreview: string
}

interface RequiredEmailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  requiredEmail: RequiredEmail | null
  jobNumber: string
  jobId: string
  onSendAndProceed: () => Promise<void>
}

export function RequiredEmailModal({
  open,
  onOpenChange,
  requiredEmail,
  jobNumber,
  jobId,
  onSendAndProceed,
}: RequiredEmailModalProps) {
  const [sending, setSending] = useState(false)

  if (!requiredEmail) return null

  const handleSendNow = async () => {
    setSending(true)
    try {
      await onSendAndProceed()
      onOpenChange(false)
    } catch (error) {
      console.error("[v0] Failed to send email:", error)
    } finally {
      setSending(false)
    }
  }

  const emailTypeLabel = {
    invoice: "Invoice / Deposit Request",
    reservation: "Reservation Confirmation",
    voucher: "Travel Voucher",
  }[requiredEmail.type]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            Required Email Not Sent
          </DialogTitle>
          <DialogDescription>
            This job requires a <strong>{emailTypeLabel}</strong> to be sent before moving to "{requiredEmail.stageName}".
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            The system requires that customers receive appropriate communications at each stage of the booking process.
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">Email Subject:</p>
            <p className="text-sm text-muted-foreground">{requiredEmail.subject}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">Preview:</p>
            <p className="text-sm text-muted-foreground line-clamp-3">{requiredEmail.bodyPreview}</p>
          </div>
          <div className="bg-secondary/50 border border-border rounded-md p-3">
            <p className="text-xs text-muted-foreground">
              <strong>Job:</strong> {jobNumber}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSendNow} disabled={sending}>
            <Mail className="w-4 h-4 mr-1.5" />
            {sending ? "Sending..." : "Send Now & Proceed"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
