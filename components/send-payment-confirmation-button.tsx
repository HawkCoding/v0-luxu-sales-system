"use client"

import { useState } from "react"
import { Loader2, MailCheck } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { PreviewAndSendDialog } from "@/components/preview-and-send-dialog"

interface SendPaymentConfirmationButtonProps {
  jobId: string
  /** No payments yet → the prepare endpoint would 422; hide the button. */
  hasPayments: boolean
  mutate: () => void
}

interface PreparedEmail {
  email: {
    to: string
    subject: string
    bodyHtml: string
    bodyContentHtml?: string
  }
  attachment?: {
    filename: string
    contentBase64: string
    contentType?: string
  }
}

/**
 * After recording a payment: sends the "payment received" confirmation with the
 * amended confirmation invoice (updated status + money ladder) attached.
 */
export function SendPaymentConfirmationButton({
  jobId,
  hasPayments,
  mutate,
}: SendPaymentConfirmationButtonProps) {
  const [preparing, setPreparing] = useState(false)
  const [prepared, setPrepared] = useState<PreparedEmail | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  if (!hasPayments) return null

  const handlePrepare = async () => {
    setPreparing(true)
    try {
      const res = await fetch(`/api/jobs/${jobId}/payment-received`, { method: "POST" })
      const body = (await res.json().catch(() => ({}))) as PreparedEmail & { error?: string }
      if (!res.ok || !body.email) throw new Error(body.error)
      setPrepared(body)
      setPreviewOpen(true)
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "Could not prepare the payment confirmation",
      )
    } finally {
      setPreparing(false)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={handlePrepare} disabled={preparing}>
        {preparing ? (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        ) : (
          <MailCheck className="mr-1 h-3.5 w-3.5" />
        )}
        Send payment confirmation
      </Button>
      {prepared ? (
        <PreviewAndSendDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          title="Payment received"
          description="Confirms the payment and attaches the amended confirmation invoice. Review and edit before sending."
          bookingId={jobId}
          initialSubject={prepared.email.subject}
          bodyHtml={prepared.email.bodyHtml}
          bodyContentHtml={prepared.email.bodyContentHtml}
          kind="payment_received"
          to={prepared.email.to}
          attachments={prepared.attachment ? [prepared.attachment] : undefined}
          onSent={mutate}
        />
      ) : null}
    </>
  )
}
