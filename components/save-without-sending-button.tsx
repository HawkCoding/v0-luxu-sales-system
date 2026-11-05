"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { issuedDocumentTypeForKind, wasDocumentEmailed } from "@/lib/documents/issued-documents"
import { useJobDocumentVersions } from "@/lib/use-data"

/** The email kinds whose document can be kept without sending. A reminder is an email in its own
 *  right, not a new version of the invoice, so it is not one of them. */
const SAVEABLE_KINDS = new Set(["quote", "invoice", "payment_received", "voucher"])

interface SaveWithoutSendingButtonProps {
  bookingId: string
  /** The email kind the dialog sends under; decides which document this is. */
  kind: string
  quoteId?: string
  voucherId?: string
  /** The prepared PDF, when the dialog holds it. A quote is rendered by the server instead. */
  attachments?: Array<{ filename: string; contentBase64: string; contentType?: string }>
  disabled?: boolean
  /** Called after the copy is kept, so the dialog can close. */
  onSaved: () => void
  /** Tells the dialog whether this document has been emailed before (it then reads "Send updated ..."). */
  onEmailedBeforeChange?: (emailedBefore: boolean) => void
}

/**
 * "Save without sending": keep the document as it is now as the latest copy, without emailing it.
 * Only offered for an UPDATE: the first quote, invoice and voucher must be emailed, because that
 * send is what moves the booking forward, so the button stays hidden until one has gone out. A
 * document emailed before copies were kept counts as sent, even though there is no kept copy.
 */
export function SaveWithoutSendingButton({
  bookingId,
  kind,
  quoteId,
  voucherId,
  attachments,
  disabled = false,
  onSaved,
  onEmailedBeforeChange,
}: SaveWithoutSendingButtonProps) {
  const saveable = SAVEABLE_KINDS.has(kind)
  const docType = issuedDocumentTypeForKind(kind)
  const { data, mutate } = useJobDocumentVersions(saveable ? bookingId : null)
  const [saving, setSaving] = useState(false)

  const emailedBefore = wasDocumentEmailed(data, docType)

  useEffect(() => {
    onEmailedBeforeChange?.(saveable && emailedBefore)
  }, [onEmailedBeforeChange, saveable, emailedBefore])

  if (!saveable || !emailedBefore) return null

  async function handleSave() {
    setSaving(true)
    try {
      const response = await fetch(`/api/jobs/${bookingId}/document-versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, quoteId, voucherId, attachments }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(payload?.error ?? "The document could not be saved")

      toast.success("Saved without sending. Nothing was emailed.")
      await mutate()
      onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The document could not be saved")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-1 sm:items-end">
      <Button
        type="button"
        variant="outline"
        onClick={() => void handleSave()}
        disabled={disabled || saving}
        title="Keep this version as the latest, without emailing the client"
      >
        <Save data-icon="inline-start" aria-hidden />
        {saving ? "Saving..." : "Save without sending"}
      </Button>
      <p className="text-xs text-muted-foreground">Keeps this version on the booking. The client is not emailed.</p>
    </div>
  )
}
