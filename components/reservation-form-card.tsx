"use client"

import { useState } from "react"
import { Loader2, Send } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { PreviewAndSendDialog } from "@/components/preview-and-send-dialog"
import { formatDisplayDate } from "@/lib/date-format"

interface ReservationFormCardProps {
  jobId: string
  reservationFormReceivedAt: string | null
  mutate: () => void
  onMarkedReceived?: () => void
}

interface PreparedEmail {
  email: {
    to: string
    subject: string
    bodyHtml: string
    bodyContentHtml?: string
  }
}

/**
 * Quote-accepted step: tick when the client's signed reservation form comes
 * back, then send the acknowledgement ("reservation received") email.
 */
export function ReservationFormCard({
  jobId,
  reservationFormReceivedAt,
  mutate,
  onMarkedReceived,
}: ReservationFormCardProps) {
  const [saving, setSaving] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [prepared, setPrepared] = useState<PreparedEmail | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  const received = Boolean(reservationFormReceivedAt)

  const handleToggle = async (checked: boolean) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationFormReceived: checked }),
      })
      if (!res.ok) throw new Error()
      mutate()
      if (checked) onMarkedReceived?.()
    } catch {
      toast.error("Could not update the reservation form status")
    } finally {
      setSaving(false)
    }
  }

  const handlePrepare = async () => {
    setPreparing(true)
    try {
      const res = await fetch(`/api/jobs/${jobId}/reservation-received`, { method: "POST" })
      const body = (await res.json().catch(() => ({}))) as PreparedEmail & { error?: string }
      if (!res.ok || !body.email) throw new Error(body.error)
      setPrepared(body)
      setPreviewOpen(true)
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "Could not prepare the acknowledgement email",
      )
    } finally {
      setPreparing(false)
    }
  }

  return (
    <Card className="mb-4">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="reservation-form-received"
            checked={received}
            disabled={saving}
            onCheckedChange={(checked) => handleToggle(checked === true)}
          />
          <Label htmlFor="reservation-form-received" className="text-sm">
            Reservation form received
            {received && reservationFormReceivedAt ? (
              <span className="ml-1 text-xs text-muted-foreground">
                ({formatDisplayDate(reservationFormReceivedAt.slice(0, 10))})
              </span>
            ) : null}
          </Label>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePrepare}
          disabled={preparing}
        >
          {preparing ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="mr-1 h-3.5 w-3.5" />
          )}
          Send acknowledgement
        </Button>
      </CardContent>
      {prepared ? (
        <PreviewAndSendDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          title="Reservation received"
          description="Acknowledge the client's reservation form. Review and edit before sending."
          bookingId={jobId}
          initialSubject={prepared.email.subject}
          bodyHtml={prepared.email.bodyHtml}
          bodyContentHtml={prepared.email.bodyContentHtml}
          kind="reservation_received"
          to={prepared.email.to}
          onSent={mutate}
        />
      ) : null}
    </Card>
  )
}
