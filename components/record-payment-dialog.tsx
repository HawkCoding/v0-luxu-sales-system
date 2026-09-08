"use client"

// Extracted from components/job-payments-tab.tsx (F-P1-8) so the paid-in-full stage gate can open
// the same form pre-filled with the outstanding balance, instead of asking a consultant to tick a
// box asserting money that was never recorded. See the "Record the balance payment" action on the
// final_payment_confirmation gate in components/stage-transition-modal.tsx.
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { BASE_CURRENCY } from "@/lib/money"
import { toast } from "sonner"
import { useDirtyCloseGuard } from "@/hooks/use-dirty-close-guard"
import { DiscardChangesDialog } from "@/components/discard-changes-dialog"

function todayLocal(): string {
  return new Date().toISOString().slice(0, 10)
}

interface PaymentFormState {
  amount: string
  method: string
  reference: string
  notes: string
  paymentDate: string
}

function initialFormState(defaultAmount?: number | null): PaymentFormState {
  return {
    amount: defaultAmount != null && defaultAmount > 0 ? String(defaultAmount) : "",
    method: "EFT",
    reference: "",
    notes: "",
    paymentDate: todayLocal(),
  }
}

interface RecordPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  jobId: string
  mutate: () => void
  /** The booking's billing currency — an invoice is always raised in its quote's currency, and a
   *  payment is always made in its invoice's. */
  currency?: string
  /** Pre-fills the amount field. Used by the paid-in-full gate to seed the real outstanding
   *  balance rather than leaving the field blank for the consultant to look up and retype. */
  defaultAmount?: number | null
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  jobId,
  mutate,
  currency = BASE_CURRENCY,
  defaultAmount,
}: RecordPaymentDialogProps) {
  const [form, setForm] = useState<PaymentFormState>(() => initialFormState(defaultAmount))
  const [saving, setSaving] = useState(false)

  // Reseed the form to the current default (and today's date) each time the dialog opens, rather
  // than once on mount — the modal that owns this dialog stays mounted between opens.
  useEffect(() => {
    if (open) setForm(initialFormState(defaultAmount))
  }, [open, defaultAmount])

  const baseline = initialFormState(defaultAmount)
  const isFormDirty =
    form.amount !== baseline.amount ||
    form.method !== baseline.method ||
    form.reference !== baseline.reference ||
    form.notes !== baseline.notes ||
    form.paymentDate !== baseline.paymentDate

  const closeGuard = useDirtyCloseGuard({
    isDirty: isFormDirty,
    onConfirmedClose: () => onOpenChange(false),
  })

  const handleSubmit = async () => {
    setSaving(true)
    try {
      // paymentDate from the local date picker is a plain date string; convert
      // to a UTC ISO datetime so paymentSchema's datetime({ offset: true }) accepts it.
      const paymentDate = form.paymentDate
        ? new Date(`${form.paymentDate}T12:00:00Z`).toISOString()
        : new Date().toISOString()

      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          amount: Number(form.amount),
          method: form.method,
          reference: form.reference || null,
          notes: form.notes || null,
          paymentDate,
        }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string; details?: Record<string, unknown> }
        throw new Error(payload.error ?? "Failed to record payment")
      }

      mutate()
      onOpenChange(false)
      toast.success("Payment recorded")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record payment")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : closeGuard.handleOpenChange(false))}>
      <DialogContent {...closeGuard.contentProps}>
        <DiscardChangesDialog
          open={closeGuard.confirming}
          onKeepEditing={closeGuard.cancelDiscard}
          onDiscard={closeGuard.confirmDiscard}
        />
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>Enter the payment details for this job.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Payment Date</label>
            <DatePicker value={form.paymentDate} onChange={(value) => setForm(f => ({ ...f, paymentDate: value ?? "" }))} className="mt-1" aria-label="Payment date" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Amount ({currency})</label>
            <Input type="number" value={form.amount} onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Method</label>
            <Select value={form.method} onValueChange={(v) => setForm(f => ({ ...f, method: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EFT">EFT</SelectItem>
                <SelectItem value="Credit Card">Credit Card</SelectItem>
                <SelectItem value="Credit Adjustment">Credit Adjustment</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Reference</label>
            <Input value={form.reference} onChange={(e) => setForm(f => ({ ...f, reference: e.target.value }))} className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <Input value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => closeGuard.handleOpenChange(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSubmit} disabled={saving || !form.amount}>
              {saving ? "Saving..." : "Record"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
