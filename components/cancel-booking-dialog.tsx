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
import { CANCEL_REASONS, type PipelineStage } from "@/lib/types"

interface CancelBookingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookingId: string
  bookingNumber: string
  sourceStage: PipelineStage
  onCancelled: () => void
}

export function CancelBookingDialog({
  open,
  onOpenChange,
  bookingId,
  bookingNumber,
  sourceStage,
  onCancelled,
}: CancelBookingDialogProps) {
  const [reason, setReason] = useState("")
  const [notes, setNotes] = useState("")
  const [refundStatus, setRefundStatus] = useState<"refunded" | "not_refunded" | "">("")
  const [refundAmount, setRefundAmount] = useState("")
  const [refundReference, setRefundReference] = useState("")
  const [refundedAt, setRefundedAt] = useState("")
  const [loading, setLoading] = useState(false)
  const requiresRefundCapture = ["deposit_paid", "final_paid", "voucher_sent", "closed", "trip_active"].includes(sourceStage)

  const handleOpenChange = (nextOpen: boolean) => {
    if (!loading) {
      if (!nextOpen) {
        setReason("")
        setNotes("")
        setRefundStatus("")
        setRefundAmount("")
        setRefundReference("")
        setRefundedAt("")
      }
      onOpenChange(nextOpen)
    }
  }

  const handleConfirm = async () => {
    if (!reason) return
    if (requiresRefundCapture && !refundStatus) return
    if (
      requiresRefundCapture &&
      refundStatus === "refunded" &&
      (!refundAmount.trim() || !refundReference.trim() || !refundedAt)
    ) {
      return
    }
    setLoading(true)
    const finalReason = notes.trim() ? `${reason} - ${notes.trim()}` : reason
    try {
      const res = await fetch(`/api/jobs/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: "lost",
          cancelReason: finalReason,
          lostContext: requiresRefundCapture
            ? {
                cancelReason: finalReason,
                refundStatus,
                refundAmount: refundStatus === "refunded" ? Number(refundAmount) : null,
                refundReference: refundStatus === "refunded" ? refundReference.trim() : null,
                refundedAt: refundStatus === "refunded" ? refundedAt : null,
              }
            : { cancelReason: finalReason },
        }),
      })
      if (res.ok) {
        toast.success("Booking cancelled")
        onOpenChange(false)
        setReason("")
        setNotes("")
        setRefundStatus("")
        setRefundAmount("")
        setRefundReference("")
        setRefundedAt("")
        onCancelled()
      } else {
        toast.error("Failed to cancel booking")
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

          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason">Reason for cancellation</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="cancel-reason">
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {CANCEL_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
                    <Label htmlFor="refund-amount">Refund amount</Label>
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
              !reason ||
              loading ||
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
