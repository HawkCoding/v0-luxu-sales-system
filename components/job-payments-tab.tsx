"use client"

// Gating contract: "Record Payment" is hidden when the user lacks `edit:payments`,
// and rendered as disabled-with-reason until the booking reaches `deposit_requested`
// (i.e. after the deposit invoice has been sent).
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Payment, PipelineStage } from "@/lib/types"
import { useRole } from "@/lib/role-context"
import { useState } from "react"
import { Plus } from "lucide-react"
import { formatDisplayDate } from "@/lib/date-format"
import { BASE_CURRENCY, formatMoney } from "@/lib/money"
import { toast } from "sonner"

const PAYMENT_ENABLED_STAGES: ReadonlySet<PipelineStage> = new Set([
  "deposit_requested",
  "payment_schedule",
  "deposit_paid",
  "final_paid",
  "voucher_sent",
  "trip_active",
  "closed",
])

interface JobPaymentsTabProps {
  payments: Payment[]
  jobId: string
  mutate: () => void
  stage?: PipelineStage
  /** The booking's billing currency — an invoice is always raised in its quote's currency, and
   *  a payment is always made in its invoice's, so one code covers the whole tab. */
  currency?: string
}

export function JobPaymentsTab({ payments, jobId, mutate, stage, currency = BASE_CURRENCY }: JobPaymentsTabProps) {
  const { can } = useRole()
  const [open, setOpen] = useState(false)
  const todayLocal = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({ amount: "", method: "EFT", reference: "", notes: "", paymentDate: todayLocal })
  const [saving, setSaving] = useState(false)
  const canRecordPayment = can("edit:payments")
  const stageAllowsRecording = stage ? PAYMENT_ENABLED_STAGES.has(stage) : true

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0)

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
      setOpen(false)
      setForm({ amount: "", method: "EFT", reference: "", notes: "", paymentDate: new Date().toISOString().slice(0, 10) })
      toast.success("Payment recorded")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record payment")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">
            Total Received:{" "}
            <span className={totalPaid >= 0 ? "text-payment-green" : "text-payment-red"}>
              {formatMoney(totalPaid, currency)}
            </span>
          </p>
        </div>
        {canRecordPayment && (
          <Dialog open={open && stageAllowsRecording} onOpenChange={(next) => setOpen(next && stageAllowsRecording)}>
            <DialogTrigger asChild>
              {stageAllowsRecording ? (
                <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Record Payment</Button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button size="sm" disabled aria-disabled="true">
                        <Plus className="w-4 h-4 mr-1" /> Record Payment
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Available after sending the deposit invoice</TooltipContent>
                </Tooltip>
              )}
            </DialogTrigger>
            <DialogContent>
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
                  <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button size="sm" onClick={handleSubmit} disabled={saving || !form.amount}>
                    {saving ? "Saving..." : "Record"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {payments.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">No payments recorded</div>
      ) : (
        <div className="space-y-2">
          {payments.map(p => (
            <Card key={p.id}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${p.amount >= 0 ? "text-payment-green" : "text-payment-red"}`}>
                      {p.amount >= 0 ? "+" : ""}{formatMoney(p.amount, currency)}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">{p.method}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Ref: {p.reference} {p.notes ? `| ${p.notes}` : ""}</p>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {formatDisplayDate(p.receivedAt)}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
