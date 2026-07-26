"use client"

import { useState } from "react"
import { BellRing, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { PreviewAndSendDialog } from "@/components/preview-and-send-dialog"

interface SendPaymentReminderButtonProps {
  invoiceId: string
  invoiceNumber: string
  bookingId: string
  onSent: () => Promise<void> | void
}

interface PreparedReminder {
  invoice: { daysOverdue: number }
  email: {
    to: string
    subject: string
    bodyHtml: string
    bodyContentHtml?: string
    warnings?: string[]
    signatureProfileId?: string | null
    signatureBrandId?: string | null
  }
  attachment: {
    filename: string
    contentBase64: string
    contentType?: string
  }
  error?: string
}

export function SendPaymentReminderButton({
  invoiceId,
  invoiceNumber,
  bookingId,
  onSent,
}: SendPaymentReminderButtonProps) {
  const [loading, setLoading] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [prepared, setPrepared] = useState<PreparedReminder | null>(null)

  async function prepare() {
    setLoading(true)
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/reminder`, { method: "POST" })
      const payload = (await response.json()) as PreparedReminder
      if (!response.ok) {
        throw new Error(payload.error ?? "Reminder could not be prepared")
      }
      setPrepared(payload)
      setPreviewOpen(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reminder could not be prepared")
    } finally {
      setLoading(false)
    }
  }

  async function handleSent() {
    const response = await fetch(`/api/invoices/${invoiceId}/reminder`, { method: "PATCH" })
    if (!response.ok) {
      toast.error("Reminder sent, but the reminder history could not be updated")
    }
    await onSent()
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={prepare} disabled={loading}>
        {loading ? (
          <Loader2 data-icon="inline-start" className="animate-spin" />
        ) : (
          <BellRing data-icon="inline-start" />
        )}
        Send reminder — {invoiceNumber}
      </Button>

      {prepared ? (
        <PreviewAndSendDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          title="Send payment reminder"
          description={`Review the reminder for ${invoiceNumber} before sending it to the customer.`}
          bookingId={bookingId}
          initialSubject={prepared.email.subject}
          bodyHtml={prepared.email.bodyHtml}
          bodyContentHtml={prepared.email.bodyContentHtml}
          signatureProfileId={prepared.email.signatureProfileId}
          signatureBrandId={prepared.email.signatureBrandId}
          to={prepared.email.to}
          kind="payment_reminder"
          attachments={[prepared.attachment]}
          onSent={handleSent}
        />
      ) : null}
    </>
  )
}
