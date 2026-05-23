"use client"

import { useState } from "react"
import { toast } from "sonner"
import { XCircle, Loader2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import type { OutcomeReason, PipelineStage } from "@/lib/types"

interface CancelBookingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookingId: string
  bookingNumber: string
  sourceStage: PipelineStage
  outcomeReasons?: OutcomeReason[]
  suggestedRefund?: number | null
  onCancelled: () => void
}

export function CancelBookingDialog({
  open,
  onOpenChange,
  bookingId,
  bookingNumber,
  sourceStage,
  outcomeReasons = [],
  suggestedRefund,
  onCancelled,
}: CancelBookingDialogProps) {
  const [reasonId, setReasonId] = useState("")
  const [notes, setNotes] = useState("")
  const [refundStatus, setRefundStatus] = useState<"refunded" | "not_refunded" | "">("")
  const [refundAmount, setRefundAmount] = useState(
    suggestedRefund !== null && suggestedRefund !== undefined ? suggestedRefund.toFixed(2) : "",
  )
  const [refundReference, setRefundReference] = useState("")
  const [refundedAt, setRefundedAt] = useState("")
  const [loading, setLoading] = useState(false)
  const requiresRefundCapture = ["deposit_paid", "final_paid", "voucher_sent", "closed", "trip_active"].includes(sourceStage)

  const cancelReasons = outcomeReasons.filter(
    (r) => r.active && (r.appliesTo === "Cancelled" || r.appliesTo === "Both"),
  )
  const selectedReason = cancelReasons.find((r) => r.id === reasonId) ?? null
  const isOther = selectedReason?.label === "Other"

  const handleOpenChange = (nextOpen: boolean) => {
    if (!loading) {
      if (!nextOpen) {
        setReasonId("")
        setNotes("")
        setRefundStatus("")
        setRefundAmount(
          suggestedRefund !== null && suggestedRefund !== undefined ? suggestedRefund.toFixed(2) : "",
        )
        setRefundReference("")
        setRefundedAt("")
      }
      onOpenChange(nextOpen)
    }
  }

  const handleConfirm = async () => {
    const hasReason = cancelReasons.length === 0 || Boolean(reasonId)
    if (!hasReason) return
    if (isOther && !notes.trim()) return
    if (requiresRefundCapture && !refundStatus) return
    if (
      requiresRefundCapture &&
      refundStatus === "refunded" &&
      (!refundAmount.trim() || !refundReference.trim() || !refundedAt)
    ) {
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/jobs/${bookingId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcomeReasonId: reasonId || undefined,
          outcomeNotes: notes.trim() || undefined,
          refundStatus: requiresRefundCapture ? refundStatus || undefined : undefined,
          refundAmount:
            requiresRefundCapture && refundStatus === "refunded" ? Number(refundAmount) : undefined,
          refundReference:
            requiresRefundCapture && refundStatus === "refunded" ? refundReference.trim() : undefined,
          refundedAt:
            requiresRefundCapture && refundStatus === "refunded" ? refundedAt : undefined,
        }),
      })
      if (res.ok) {
        toast.success("Booking cancelled")
        onOpenChange(false)
        setReasonId("")
        setNotes("")
        setRefundStatus("")
        setRefundAmount("")
        setRefundReference("")
        setRefundedAt("")
        onCancelled()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error((data as { error?: string }).error ?? "Failed to cancel booking")
      }
    } catch {
      toast.error("Failed to cancel booking")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel Booking</DialogTitle>
          <DialogDescription>
            This will mark booking <strong>{bookingNumber}</strong> as lost and remove it from
            active work.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Cancelled bookings are moved to Lost and removed from the pipeline board.
            </AlertDescription>
          </Alert>

          {cancelReasons.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="cancel-reason">
                Reason for cancellation <span aria-hidden="true" className="text-destructive">*</span>
              </Label>
              <Select value={reasonId} onValueChange={(v) => { setReasonId(v); setNotes("") }}>
                <SelectTrigger id="cancel-reason">
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent>
                  {cancelReasons.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {isOther && (
            <div className="space-y-1.5">
              <Label htmlFor="cancel-notes">
                Please describe <span aria-hidden="true" className="text-destructive">*</span>
              </Label>
              <Textarea
                id="cancel-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 300))}
                placeholder="Brief description..."
                rows={2}
                className="resize-none"
              />
            </div>
          )}

          {!isOther && cancelReasons.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="cancel-notes">Additional notes (optional)</Label>
              <Textarea
                id="cancel-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 180))}
                placeholder="Short note..."
                rows={2}
                className="resize-none"
              />
            </div>
          )}

          {requiresRefundCapture && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="space-y-1.5">
                <Label>Refund status</Label>
                <RadioGroup
                  value={refundStatus}
                  onValueChange={(value) => setRefundStatus(value as "refunded" | "not_refunded")}
                  className="flex gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="refund-yes" value="refunded" />
                    <Label htmlFor="refund-yes" className="text-sm">Refunded</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="refund-no" value="not_refunded" />
                    <Label htmlFor="refund-no" className="text-sm">Not refunded</Label>
                  </div>
                </RadioGroup>
              </div>

              {refundStatus === "refunded" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="refund-amount">
                      Refund amount
                      {suggestedRefund !== null && suggestedRefund !== undefined && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          (suggested: {suggestedRefund.toFixed(2)})
                        </span>
                      )}
                    </Label>
                    <Input
                      id="refund-amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={refundAmount}
                      onChange={(event) => setRefundAmount(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="refund-date">Refunded at</Label>
                    <Input
                      id="refund-date"
                      type="date"
                      value={refundedAt}
                      onChange={(event) => setRefundedAt(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="refund-reference">Refund reference</Label>
                    <Input
                      id="refund-reference"
                      value={refundReference}
                      onChange={(event) => setRefundReference(event.target.value)}
                      placeholder="Bank reference or internal note"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={
              loading ||
              (cancelReasons.length > 0 && !reasonId) ||
              (isOther && !notes.trim()) ||
              (requiresRefundCapture && !refundStatus) ||
              (requiresRefundCapture &&
                refundStatus === "refunded" &&
                (!refundAmount.trim() || !refundReference.trim() || !refundedAt))
            }
          >
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <XCircle className="w-4 h-4 mr-1" />}
            Cancel Booking
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
