"use client"

import { useState } from "react"
import { Loader2, Send } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { PreviewAndSendDialog } from "@/components/preview-and-send-dialog"

interface SendVoucherButtonProps {
  voucherId: string | null
  /**
   * Called on click instead of using `voucherId` directly. Lets the caller generate
   * any missing PDF first and return the voucher id to prepare. Return null to abort
   * the send.
   */
  resolveVoucherId?: () => Promise<string | null>
  bookingNumber: string
  disabled?: boolean
  onSent?: () => Promise<void> | void
}

interface PreparedVoucherSend {
  voucher: { id: string; voucherNumber: string; jobId: string }
  email: {
    to: string
    subject: string
    bodyHtml: string
    bodyContentHtml?: string
    warnings?: string[]
    signatureProfileId?: string | null
    signatureBrandId?: string | null
  }
  attachments: Array<{
    filename: string
    contentBase64: string
    contentType?: string
  }>
  error?: string
}

export function SendVoucherButton({
  voucherId,
  resolveVoucherId,
  bookingNumber,
  disabled,
  onSent,
}: SendVoucherButtonProps) {
  const [loading, setLoading] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [prepared, setPrepared] = useState<PreparedVoucherSend | null>(null)

  async function prepare() {
    setLoading(true)
    try {
      const id = resolveVoucherId ? await resolveVoucherId() : voucherId
      if (!id) {
        // resolveVoucherId surfaces its own error toast; only the plain path needs one.
        if (!resolveVoucherId) toast.error("Generate the voucher PDF before sending")
        return
      }
      const response = await fetch(`/api/vouchers/${id}/prepare-send`, { method: "POST" })
      const payload = (await response.json().catch(() => ({}))) as PreparedVoucherSend
      if (!response.ok) {
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
      <Button
        size="sm"
        variant="default"
        disabled={disabled || loading || (!voucherId && !resolveVoucherId)}
        onClick={prepare}
      >
        {loading ? (
          <Loader2 data-icon="inline-start" className="animate-spin" />
        ) : (
          <Send data-icon="inline-start" />
        )}
        {loading ? "Preparing…" : "Preview & Send Voucher"}
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
          signatureProfileId={prepared.email.signatureProfileId}
          signatureBrandId={prepared.email.signatureBrandId}
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
