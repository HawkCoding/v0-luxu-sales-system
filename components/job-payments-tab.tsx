"use client"

// Gating contract: "Record Payment" is hidden when the user lacks `edit:payments`,
// and rendered as disabled-with-reason until the booking reaches `deposit_requested`
// (i.e. after the deposit invoice has been sent).
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { Payment, PipelineStage } from "@/lib/types"
import { useRole } from "@/lib/role-context"
import { useState } from "react"
import { Plus, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { formatDisplayDate } from "@/lib/date-format"
import { BASE_CURRENCY, formatMoney } from "@/lib/money"
import { RecordPaymentDialog } from "@/components/record-payment-dialog"

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
  /** Received above the accepted quote total. The balance clamps at zero, so without this
   *  an overpayment is indistinguishable from paying to the cent. */
  overpaidAmount?: number | null
}

export function JobPaymentsTab({ payments, jobId, mutate, stage, currency = BASE_CURRENCY, overpaidAmount }: JobPaymentsTabProps) {
  const { can } = useRole()
  const [open, setOpen] = useState(false)
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null)
  const [deletingPayment, setDeletingPayment] = useState<Payment | null>(null)
  const [deleting, setDeleting] = useState(false)
  const canRecordPayment = can("edit:payments")
  const stageAllowsRecording = stage ? PAYMENT_ENABLED_STAGES.has(stage) : true

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0)
  const isOverpaid = (overpaidAmount ?? 0) > 0

  const handleDelete = async () => {
    if (!deletingPayment) return
    setDeleting(true)
    try {
      const response = await fetch(`/api/payments/${deletingPayment.id}`, { method: "DELETE" })
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error ?? "Failed to delete payment")
      }
      mutate()
      toast.success("Payment deleted")
      setDeletingPayment(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete payment")
    } finally {
      setDeleting(false)
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
          {isOverpaid && (
            <p className="mt-1 text-sm font-medium text-payment-red">
              Overpaid by {formatMoney(overpaidAmount ?? 0, currency)} — more received than the quote total. Reconcile or refund.
            </p>
          )}
        </div>
        {canRecordPayment && (
          <>
            {stageAllowsRecording ? (
              <Button size="sm" onClick={() => setOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> Record Payment
              </Button>
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
            <RecordPaymentDialog
              open={open && stageAllowsRecording}
              onOpenChange={setOpen}
              jobId={jobId}
              mutate={mutate}
              currency={currency}
            />
            <RecordPaymentDialog
              open={Boolean(editingPayment)}
              onOpenChange={(next) => !next && setEditingPayment(null)}
              jobId={jobId}
              mutate={mutate}
              currency={currency}
              existingPayment={editingPayment}
            />
            <AlertDialog open={Boolean(deletingPayment)} onOpenChange={(next) => !next && setDeletingPayment(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this payment?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {deletingPayment &&
                      `This removes the ${formatMoney(deletingPayment.amount, currency)} payment from ${formatDisplayDate(deletingPayment.receivedAt)} and recalculates the booking's balance. This can't be undone.`}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void handleDelete()} disabled={deleting}>
                    {deleting ? "Deleting..." : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
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
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs text-muted-foreground">{formatDisplayDate(p.receivedAt)}</span>
                  {canRecordPayment && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label="Edit payment"
                        onClick={() => setEditingPayment(p)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-payment-red hover:text-payment-red"
                        aria-label="Delete payment"
                        onClick={() => setDeletingPayment(p)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
