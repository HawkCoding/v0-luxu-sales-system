"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { PreviewAndSendDialog } from "@/components/preview-and-send-dialog"
import { formatDisplayDate } from "@/lib/date-format"
import type { PipelineStage } from "@/lib/types"

interface ReservationFormCardProps {
  jobId: string
  reservationFormReceivedAt: string | null
  mutate: () => void
  onMarkedReceived?: () => void
  stage: PipelineStage
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
 * Quote-accepted gate: ticking "received" composes the acknowledgement email
 * and opens the send dialog immediately. The DB flag (and the pipeline gate
 * it satisfies) is only set once the email is actually sent — cancelling the
 * dialog leaves the box unticked.
 */
export function ReservationFormCard({
  jobId,
  reservationFormReceivedAt,
  mutate,
  onMarkedReceived,
  stage,
}: ReservationFormCardProps) {
  const [preparing, setPreparing] = useState(false)
  const [unchecking, setUnchecking] = useState(false)
  const [prepared, setPrepared] = useState<PreparedEmail | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  const received = Boolean(reservationFormReceivedAt)
  // Only auto-advance from quote_sent: apply-transition sets the target stage
  // unconditionally (no forward-only check), so sending this from a later
  // stage would regress it back to "accepted".
  const moveStage = stage === "quote_sent" ? "accepted" : undefined

  const persistReceived = async (checked: boolean) => {
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationFormReceived: checked }),
    })
    if (!res.ok) throw new Error()
  }

  const handleUncheck = async () => {
    setUnchecking(true)
    try {
      await persistReceived(false)
      mutate()
    } catch {
      toast.error("Could not update the reservation form status")
    } finally {
      setUnchecking(false)
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

  const handleConfirmedReceived = async () => {
    try {
      await persistReceived(true)
      mutate()
      onMarkedReceived?.()
    } catch {
      toast.error("Could not update the reservation form status")
    }
  }

  return (
    <Card className="mb-4">
      <CardContent className="flex flex-wrap items-center gap-3 py-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="reservation-form-received"
            checked={received}
            disabled={preparing || unchecking}
            onCheckedChange={(checked) =>
              checked === true ? handlePrepare() : handleUncheck()
            }
          />
          <Label htmlFor="reservation-form-received" className="text-sm">
            Reservation form received
            {received && reservationFormReceivedAt ? (
              <span className="ml-1 text-xs text-muted-foreground">
                ({formatDisplayDate(reservationFormReceivedAt.slice(0, 10))})
              </span>
            ) : null}
          </Label>
          {preparing ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
        </div>
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
          moveStage={moveStage}
          to={prepared.email.to}
          onSent={handleConfirmedReceived}
        />
      ) : null}
    </Card>
  )
}
