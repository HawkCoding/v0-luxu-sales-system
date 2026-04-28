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
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CANCEL_REASONS } from "@/lib/types"

interface CancelBookingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookingId: string
  bookingNumber: string
  onCancelled: () => void
}

export function CancelBookingDialog({
  open,
  onOpenChange,
  bookingId,
  bookingNumber,
  onCancelled,
}: CancelBookingDialogProps) {
  const [reason, setReason] = useState("")
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(false)

  const handleOpenChange = (nextOpen: boolean) => {
    if (!loading) {
      if (!nextOpen) {
        setReason("")
        setNotes("")
      }
      onOpenChange(nextOpen)
    }
  }

  const handleConfirm = async () => {
    if (!reason) return
    setLoading(true)
    const finalReason = notes.trim() ? `${reason} - ${notes.trim()}` : reason
    try {
      const res = await fetch(`/api/jobs/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "lost", cancelReason: finalReason }),
      })
      if (res.ok) {
        toast.success("Booking cancelled")
        onOpenChange(false)
        setReason("")
        setNotes("")
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={!reason || loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <XCircle className="w-4 h-4 mr-1" />}
            Cancel Booking
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
