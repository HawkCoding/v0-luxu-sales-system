"use client"

import { useState } from "react"
import { Loader2, Send } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { PreviewAndSendDialog } from "@/components/preview-and-send-dialog"

interface SendVoucherButtonProps {
  voucherId: string | null
  bookingNumber: string
  disabled?: boolean
  onSent?: () => Promise<void> | void
  onMissingItinerary?: () => void
}

interface PreparedVoucherSend {
  voucher: { id: string; voucherNumber: string; jobId: string }
  email: {
    to: string
    subject: string
    bodyHtml: string
    bodyContentHtml?: string
    warnings?: string[]
  }
  attachments: Array<{
    filename: string
    contentBase64: string
    contentType?: string
  }>
  error?: string
  details?: { missingItinerary?: boolean }
}

export function SendVoucherButton({
  voucherId,
  bookingNumber,
  disabled,
  onSent,
  onMissingItinerary,
}: SendVoucherButtonProps) {
  const [loading, setLoading] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [prepared, setPrepared] = useState<PreparedVoucherSend | null>(null)

  async function prepare() {
    if (!voucherId) {
      toast.error("Generate the voucher PDF before sending")
      return
    }
    setLoading(true)
    try {
      const response = await fetch(`/api/vouchers/${voucherId}/prepare-send`, { method: "POST" })
      const payload = (await response.json().catch(() => ({}))) as PreparedVoucherSend
      if (!response.ok) {
        if (payload.details?.missingItinerary) {
          toast.error("Generate the itinerary first — the voucher email includes both PDFs", {
            action: onMissingItinerary
              ? { label: "Generate Itinerary", onClick: onMissingItinerary }
              : undefined,
          })
          return
        }
        throw new Error(payload.error ?? "Voucher email could not be prepared")
      }
      setPrepared(payload)
      setPreviewOpen(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Voucher email could not be prepared")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button size="sm" variant="default" disabled={disabled || loading || !voucherId} onClick={prepare}>
        {loading ? (
          <Loader2 data-icon="inline-start" className="animate-spin" />
        ) : (
          <Send data-icon="inline-start" />
        )}
        {loading ? "Preparing…" : "Send Voucher"}
      </Button>

      {prepared ? (
        <PreviewAndSendDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          title="Send travel voucher"
          description={`Voucher and itinerary for ${bookingNumber} — review before sending.`}
          bookingId={prepared.voucher.jobId}
          initialSubject={prepared.email.subject}
          bodyHtml={prepared.email.bodyHtml}
          bodyContentHtml={prepared.email.bodyContentHtml}
          to={prepared.email.to}
          kind="voucher"
          moveStage="voucher_sent"
          voucherId={prepared.voucher.id}
          attachments={prepared.attachments}
          onSent={async () => {
            await onSent?.()
          }}
        />
      ) : null}
    </>
  )
}
