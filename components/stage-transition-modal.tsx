"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, FileText, ShieldAlert, Wand2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import type { GateFailure, ManualConfirmations } from "@/lib/pipeline/validate-transition"
import { getPipelineStageLabel, type PipelineStage } from "@/lib/types"

const GATE_TAB_MAP: Record<string, string> = {
  customer_complete: "?tab=enquiry",
  quote_sent_required: "?tab=quotes",
  quote_sent_or_accepted: "?tab=quotes",
  invoice_document: "?tab=documents",
  invoice_correspondence: "?tab=correspondence",
  final_invoice: "?tab=documents",
  final_invoice_correspondence: "?tab=correspondence",
  voucher_document: "?tab=documents",
  voucher_correspondence: "?tab=correspondence",
  email_import_review: "?tab=enquiry",
  cancel_reason: "",
  refund_capture: "",
  deposit_received_confirmation: "",
  final_payment_confirmation: "",
}

interface StageTransitionModalProps {
  open: boolean
  jobId: string
  jobNumber: string
  targetStage: PipelineStage | null
  failures: GateFailure[]
  isManager: boolean
  submitting: boolean
  onCancel: () => void
  onProceed: (manualConfirmations: ManualConfirmations) => Promise<void>
  onOverride: (overrideReason: string) => Promise<void>
  /**
   * Optional callback that opens the booking's final-invoice generation
   * flow. When provided, a blocking `final_invoice_correspondence` failure
   * renders an inline "Send final invoice" button that invokes this
   * callback (mirroring the dialog opened from the booking page). When
   * omitted (e.g. on the pipeline page where the relevant booking-level
   * data is not loaded), only the standard "Fix" link is shown.
   */
  onSendFinalInvoice?: () => void
}

export function gateIdToTabPath(gateId: string): string {
  return GATE_TAB_MAP[gateId] ?? ""
}

export function confirmationKeyForFailure(failure: GateFailure): keyof ManualConfirmations | null {
  if (failure.autoFixable === "create_invoice_25pct") return "createDepositInvoice"
  if (failure.autoFixable === "create_final_invoice") return "createFinalInvoice"
  if (failure.autoFixable === "create_invoice_correspondence") return "createInvoiceCorrespondence"
  if (failure.gateId === "deposit_received_confirmation") return "depositReceived"
  if (failure.gateId === "final_payment_confirmation") return "finalPaymentReceived"
  return null
}

export function StageTransitionModal({
  open,
  jobId,
  jobNumber,
  targetStage,
  failures,
  isManager,
  submitting,
  onCancel,
  onProceed,
  onOverride,
  onSendFinalInvoice,
}: StageTransitionModalProps) {
  const [confirmations, setConfirmations] = useState<ManualConfirmations>({})
  const [overrideReason, setOverrideReason] = useState("")
  const confirmationFailures = useMemo(
    () => failures.filter((failure) => failure.severity === "confirm"),
    [failures],
  )
  const hasBlockingFailures = failures.some((failure) => failure.severity === "block")
  const allConfirmationsChecked = confirmationFailures.every((failure) => {
    const key = confirmationKeyForFailure(failure)
    return key ? confirmations[key] === true : true
  })

  const handleConfirmationChange = (failure: GateFailure, checked: boolean) => {
    const key = confirmationKeyForFailure(failure)
    if (!key) return
    setConfirmations((current) => ({ ...current, [key]: checked }))
  }

  const handleProceed = async () => {
    await onProceed(confirmations)
    setConfirmations({})
  }

  const handleOverride = async () => {
    await onOverride(overrideReason)
    setOverrideReason("")
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <DialogContent
        className="sm:max-w-2xl"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle data-icon="inline-start" />
            Stage move needs attention
          </DialogTitle>
          <DialogDescription>
            {jobNumber} cannot move to {targetStage ? getPipelineStageLabel(targetStage) : "the selected stage"} until
            these checks are cleared.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {failures.map((failure) => {
            const confirmationKey = confirmationKeyForFailure(failure)
            const showSendFinalInvoice =
              failure.gateId === "final_invoice_correspondence" &&
              failure.severity === "block" &&
              typeof onSendFinalInvoice === "function"
            return (
              <Alert key={failure.gateId} variant={failure.severity === "block" ? "destructive" : "default"}>
                <AlertTriangle />
                <AlertDescription>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{failure.message}</span>
                          <Badge variant={failure.severity === "block" ? "destructive" : "secondary"}>
                            {failure.severity === "block" ? "Blocked" : "Confirmation"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm">{failure.fixHint}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {showSendFinalInvoice ? (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => onSendFinalInvoice?.()}
                            disabled={submitting}
                          >
                            <FileText data-icon="inline-start" />
                            Send final invoice
                          </Button>
                        ) : null}
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/app/bookings/${jobId}${gateIdToTabPath(failure.gateId)}`}>Fix</Link>
                        </Button>
                      </div>
                    </div>
                    {confirmationKey && failure.autoFixable && (
                      <div className="flex items-center gap-2">
                        {confirmations[confirmationKey] === true ? (
                          <div
                            className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400"
                            data-testid={`autofix-${failure.gateId}-satisfied`}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            <span>Will fix on confirm</span>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleConfirmationChange(failure, true)}
                            data-testid={`autofix-${failure.gateId}`}
                          >
                            <Wand2 data-icon="inline-start" />
                            Fix and continue
                          </Button>
                        )}
                      </div>
                    )}
                    {confirmationKey && !failure.autoFixable && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`${failure.gateId}-confirm`}
                          checked={confirmations[confirmationKey] === true}
                          onCheckedChange={(checked) => handleConfirmationChange(failure, checked === true)}
                        />
                        <Label htmlFor={`${failure.gateId}-confirm`} className="text-sm">
                          Confirm this action
                        </Label>
                      </div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )
          })}
        </div>

        {isManager && (
          <>
            <Separator />
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <ShieldAlert data-icon="inline-start" />
                <p className="text-sm font-medium">Manager override</p>
              </div>
              <Textarea
                value={overrideReason}
                onChange={(event) => setOverrideReason(event.target.value)}
                placeholder="Reason for forcing this stage move..."
                rows={3}
                className="resize-none"
              />
            </div>
          </>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel move
          </Button>
          {!hasBlockingFailures && (
            <Button onClick={handleProceed} disabled={submitting || !allConfirmationsChecked}>
              <CheckCircle2 data-icon="inline-start" />
              Confirm and move
            </Button>
          )}
          {isManager && (
            <Button variant="destructive" onClick={handleOverride} disabled={submitting || !overrideReason.trim()}>
              Force move
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
