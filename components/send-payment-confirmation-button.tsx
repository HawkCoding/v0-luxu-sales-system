"use client"

import { useEffect, useState } from "react"
import { Loader2, MailCheck } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { PreviewAndSendDialog } from "@/components/preview-and-send-dialog"

interface SendPaymentConfirmationButtonProps {
  jobId: string
  /** No payments yet → the prepare endpoint would 422; hide the button. */
  hasPayments: boolean
  mutate: () => void
  /** Controlled open state, e.g. when invoked from the stage-transition modal's fix button. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Set false to hide the built-in trigger button and rely on `open`/`onOpenChange`. */
  trigger?: boolean
}

interface PreparedEmail {
  email: {
    to: string
    subject: string
    bodyHtml: string
    bodyContentHtml?: string
    signatureProfileId?: string | null
    signatureBrandId?: string | null
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
  open,
  onOpenChange,
  trigger = true,
}: SendPaymentConfirmationButtonProps) {
  const [preparing, setPreparing] = useState(false)
  const [prepared, setPrepared] = useState<PreparedEmail | null>(null)
  const [internalPreviewOpen, setInternalPreviewOpen] = useState(false)
  const previewOpen = open ?? internalPreviewOpen
  const setPreviewOpen = onOpenChange ?? setInternalPreviewOpen

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
      setPreviewOpen(false)
    } finally {
      setPreparing(false)
    }
  }

  // Controlled mode (trigger=false): prepare the email as soon as the caller
  // opens the dialog, since there's no internal button to click.
  useEffect(() => {
    if (!trigger && open && !prepared && !preparing) {
      void handlePrepare()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, open])

  if (!hasPayments) return null

  return (
    <>
      {trigger ? (
        <Button type="button" variant="outline" size="sm" onClick={handlePrepare} disabled={preparing}>
          {preparing ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <MailCheck className="mr-1 h-3.5 w-3.5" />
          )}
          Send payment confirmation
        </Button>
      ) : null}
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
          signatureProfileId={prepared.email.signatureProfileId}
          signatureBrandId={prepared.email.signatureBrandId}
          kind="payment_received"
          to={prepared.email.to}
          attachments={prepared.attachment ? [prepared.attachment] : undefined}
          onSent={mutate}
        />
      ) : null}
    </>
  )
}
