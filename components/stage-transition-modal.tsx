"use client"

import Link from "next/link"
import { useMemo, useRef, useState } from "react"
import { CheckCircle2, ChevronDown, FileText, Info, Send, ShieldAlert, Wand2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
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

// final_payment_confirmation is a manual tick, and cancel_reason /
// refund_capture have no owning tab — all three are deliberately absent
// here, which is what makes `showFix` false for them.
const GATE_TAB_CONFIG: Record<string, { path: string; label: string }> = {
  customer_complete: { path: "?tab=enquiry", label: "Enquiry" },
  quote_sent_required: { path: "?tab=quotes", label: "Quotes" },
  quote_sent_or_accepted: { path: "?tab=quotes", label: "Quotes" },
  reservation_form_received: { path: "?tab=reservation", label: "Reservation" },
  invoice_document: { path: "?tab=documents", label: "Documents" },
  invoice_correspondence: { path: "?tab=correspondence", label: "Emails Sent" },
  deposit_received_confirmation: { path: "?tab=payments", label: "Payments" },
  final_invoice: { path: "?tab=documents", label: "Documents" },
  final_invoice_correspondence: { path: "?tab=correspondence", label: "Emails Sent" },
  leg_references: { path: "?tab=references", label: "Voucher Details" },
  voucher_document: { path: "?tab=documents", label: "Documents" },
  voucher_correspondence: { path: "?tab=correspondence", label: "Emails Sent" },
  email_import_review: { path: "?tab=enquiry", label: "Enquiry" },
}

// These three gates never mean something went wrong — the document already
// exists, it just hasn't been emailed yet. They get calmer copy, an icon,
// and badge than a genuine hard failure (see stage-transition-modal.test.tsx).
const PENDING_SEND_GATE_IDS = new Set([
  "invoice_correspondence",
  "final_invoice_correspondence",
  "voucher_correspondence",
])

function gateBadgeLabel(failure: GateFailure): string {
  if (failure.severity === "confirm") return "Confirmation"
  if (PENDING_SEND_GATE_IDS.has(failure.gateId)) return "Not sent yet"
  return "Needs action"
}

function GateIcon({ failure }: { failure: GateFailure }) {
  if (PENDING_SEND_GATE_IDS.has(failure.gateId)) return <Send className="text-muted-foreground" />
  if (failure.severity === "confirm") return <CheckCircle2 className="text-muted-foreground" />
  return <Info className="text-muted-foreground" />
}

interface StageTransitionModalProps {
  open: boolean
  jobId: string
  jobNumber: string
  targetStage: PipelineStage | null
  failures: GateFailure[]
  canOverride: boolean
  submitting: boolean
  onCancel: () => void
  onProceed: (manualConfirmations: ManualConfirmations) => Promise<void>
  onOverride: (overrideReason: string) => Promise<void>
  /**
   * Optional callback that opens the booking's payment-confirmation send
   * flow. When provided, a blocking `final_invoice_correspondence` failure
   * renders an inline "Send payment confirmation" button that invokes this
   * callback (mirroring the dialog opened from the booking page). When
   * omitted (e.g. on the pipeline page where the relevant booking-level
   * data is not loaded), only the standard "Go to … tab" link is shown.
   */
  onSendPaymentConfirmation?: () => void
  /**
   * Optional callback that opens the booking's deposit-invoice preview/send
   * flow. When provided, an `invoice_correspondence` failure (deposit invoice
   * generated but never sent) renders an inline "Send deposit invoice"
   * button so the user can finish the send instead of getting stuck.
   */
  onSendDepositInvoice?: () => void
}

export function gateIdToTabPath(gateId: string): string {
  return GATE_TAB_CONFIG[gateId]?.path ?? ""
}

export function gateIdToTabLabel(gateId: string): string {
  return GATE_TAB_CONFIG[gateId]?.label ?? ""
}

export function confirmationKeyForFailure(failure: GateFailure): keyof ManualConfirmations | null {
  if (failure.gateId === "final_payment_confirmation") return "finalPaymentReceived"
  return null
}

export function StageTransitionModal({
  open,
  jobId,
  jobNumber,
  targetStage,
  failures,
  canOverride,
  submitting,
  onCancel,
  onProceed,
  onOverride,
  onSendPaymentConfirmation,
  onSendDepositInvoice,
}: StageTransitionModalProps) {
  const [confirmations, setConfirmations] = useState<ManualConfirmations>({})
  const [overrideReason, setOverrideReason] = useState("")
  const [overrideOpen, setOverrideOpen] = useState(false)
  const overrideTextareaRef = useRef<HTMLTextAreaElement>(null)
  const confirmationFailures = useMemo(
    () => failures.filter((failure) => failure.severity === "confirm"),
    [failures],
  )
  const hasBlockingFailures = failures.some((failure) => failure.severity === "block")
  const allConfirmationsOnly = failures.length > 0 && !hasBlockingFailures
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

  const handleOverrideOpenChange = (nextOpen: boolean) => {
    setOverrideOpen(nextOpen)
    if (!nextOpen) {
      // Collapsing clears the reason so a stale draft can't be submitted
      // from a panel the user closed without meaning to force anything.
      setOverrideReason("")
    } else {
      requestAnimationFrame(() => overrideTextareaRef.current?.focus())
    }
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
            {allConfirmationsOnly ? (
              <CheckCircle2 data-icon="inline-start" />
            ) : (
              <Info data-icon="inline-start" className="text-muted-foreground" />
            )}
            {allConfirmationsOnly
              ? "Confirm this stage move"
              : failures.length > 1
                ? "A few steps first"
                : "One more step first"}
          </DialogTitle>
          <DialogDescription>
            {allConfirmationsOnly
              ? `Confirm the checks below to move ${jobNumber} to ${targetStage ? getPipelineStageLabel(targetStage) : "the selected stage"}.`
              : `${jobNumber} can move to ${targetStage ? getPipelineStageLabel(targetStage) : "the selected stage"} once the items below are done.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {failures.map((failure) => {
            const confirmationKey = confirmationKeyForFailure(failure)
            // No Fix link for gates with no target tab (manual-confirmation
            // ticks and cancel/refund gates handled elsewhere).
            const showFix = gateIdToTabPath(failure.gateId) !== ""
            const showSendPaymentConfirmation =
              failure.gateId === "final_invoice_correspondence" &&
              failure.severity === "block" &&
              typeof onSendPaymentConfirmation === "function"
            const showSendDepositInvoice =
              failure.gateId === "invoice_correspondence" &&
              typeof onSendDepositInvoice === "function"
            return (
              <Alert key={failure.gateId} variant="default" className="bg-muted/30">
                <GateIcon failure={failure} />
                <AlertDescription>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{failure.message}</span>
                          <Badge variant="secondary">{gateBadgeLabel(failure)}</Badge>
                        </div>
                        <p className="mt-1 text-sm">{failure.fixHint}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {showSendPaymentConfirmation ? (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => onSendPaymentConfirmation?.()}
                            disabled={submitting}
                          >
                            <FileText data-icon="inline-start" />
                            Send payment confirmation
                          </Button>
                        ) : null}
                        {showSendDepositInvoice ? (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => onSendDepositInvoice?.()}
                            disabled={submitting}
                            data-testid="send-deposit-invoice"
                          >
                            <FileText data-icon="inline-start" />
                            Send deposit invoice
                          </Button>
                        ) : null}
                        {showFix ? (
                          <Button asChild size="sm" variant="outline">
                            <Link
                              href={`/app/bookings/${jobId}${gateIdToTabPath(failure.gateId)}`}
                              onClick={onCancel}
                            >
                              Go to {gateIdToTabLabel(failure.gateId)} tab
                            </Link>
                          </Button>
                        ) : null}
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
                          {failure.message}
                        </Label>
                      </div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )
          })}
        </div>

        {canOverride && (
          <>
            <Separator />
            <Collapsible open={overrideOpen} onOpenChange={handleOverrideOpenChange}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 text-left"
                  aria-expanded={overrideOpen}
                >
                  <ShieldAlert data-icon="inline-start" />
                  <p className="text-sm font-medium">Override gates</p>
                  <ChevronDown
                    className={`ml-auto text-muted-foreground transition-transform ${overrideOpen ? "" : "-rotate-90"}`}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="flex flex-col gap-3 pt-3">
                <Textarea
                  ref={overrideTextareaRef}
                  value={overrideReason}
                  onChange={(event) => setOverrideReason(event.target.value)}
                  placeholder="Reason for forcing this stage move..."
                  rows={3}
                  maxLength={1000}
                  className="resize-none"
                />
              </CollapsibleContent>
            </Collapsible>
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
          {canOverride && overrideOpen && (
            <Button variant="destructive" onClick={handleOverride} disabled={submitting || !overrideReason.trim()}>
              Force move
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
