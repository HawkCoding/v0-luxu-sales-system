"use client"

// Gating contract: "Record Payment" is hidden when the user lacks `edit:payments`,
// and rendered as disabled-with-reason until the booking reaches `deposit_requested`
// (i.e. after the deposit invoice has been sent).
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Payment, PipelineStage } from "@/lib/types"
import { useRole } from "@/lib/role-context"
import { useState } from "react"
import { Plus } from "lucide-react"
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
  const canRecordPayment = can("edit:payments")
  const stageAllowsRecording = stage ? PAYMENT_ENABLED_STAGES.has(stage) : true

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0)
  const isOverpaid = (overpaidAmount ?? 0) > 0

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
