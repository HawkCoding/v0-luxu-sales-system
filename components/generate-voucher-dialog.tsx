"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, Loader2, Send } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useJobLegReferences } from "@/lib/use-data"
import { PreviewAndSendDialog } from "@/components/preview-and-send-dialog"
import {
  VoucherPreviewNotice,
  type VoucherPdf,
  type VoucherReadinessWarning,
} from "@/components/voucher-preview-notice"

interface VoucherReadinessFailure {
  code: string
  message: string
}

interface VoucherErrorPayload {
  error?: string
  details?: { failures?: VoucherReadinessFailure[] }
}

interface GenerateVoucherResponse extends VoucherErrorPayload {
  voucherRecord?: { id: string; voucherNumber: string }
  voucher?: VoucherPdf
  readinessWarnings?: VoucherReadinessWarning[]
}

interface PrepareSendResponse extends VoucherErrorPayload {
  voucher: { id: string; voucherNumber: string; jobId: string }
  email: {
    to: string
    subject: string
    bodyHtml: string
    bodyContentHtml?: string
    signatureProfileId?: string | null
    signatureBrandId?: string | null
  }
  attachments: VoucherPdf[]
}

interface PreparedVoucher {
  send: PrepareSendResponse
  warnings: VoucherReadinessWarning[]
  pdf: VoucherPdf | null
}

interface GenerateVoucherDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  jobId: string
  bookingNumber: string
  invoiceNumber?: string | null
  onSent: () => Promise<void> | void
  onGenerated?: () => Promise<void> | void
}

const BLOCKER_ID = "voucher-references-blocker"

/**
 * The voucher send flow. Opening it (and every "Preview & Send Voucher" click) rebuilds the voucher
 * PDF from the latest booking data, prepares the email, then opens the preview-and-send dialog —
 * there is no separate generate step, so an edit made after an earlier preview can never be sent
 * on a stale PDF. This dialog only carries what happens around that: the supplier-reference
 * blocker, the preparing state, and a retry when preparing fails.
 */
export function GenerateVoucherDialog({
  open,
  onOpenChange,
  jobId,
  bookingNumber,
  invoiceNumber,
  onSent,
  onGenerated,
}: GenerateVoucherDialogProps) {
  const displayNumber = invoiceNumber || bookingNumber
  const router = useRouter()
  const [preparing, setPreparing] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  // Kept after the preview closes: its send runs on a delayed undo timer and must stay mounted.
  const [prepared, setPrepared] = useState<PreparedVoucher | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  // Each run gets an id; closing the dialog bumps it so a run still in flight can't reopen a preview.
  const runId = useRef(0)
  // The caller can close this too (after a send, or when a stage move is abandoned) — clear the
  // last session's state during render so a reopen never flashes an old failure or spinner.
  const [lastOpen, setLastOpen] = useState(open)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (!open) {
      setPreparing(false)
      setFailure(null)
    }
  }

  // Preflight, so a missing reference is on screen the moment the dialog opens instead of after a
  // generate that can only 422. Same scope as the server gate — this endpoint and
  // `checkVoucherReadiness` both filter through resolveAcceptedQuoteScope — so the two agree.
  const { data: legReferences, error: legReferencesError } = useJobLegReferences(open ? jobId : null)
  const missingReferenceLabels = (legReferences?.rows ?? [])
    .filter((row) => !row.supplierReference?.trim())
    .map((row) => row.label)
  const blockedOnReferences = missingReferenceLabels.length > 0
  const checkingReferences = open && !legReferences && !legReferencesError

  function goToVoucherReferences() {
    onOpenChange(false)
    router.push(`/app/bookings/${jobId}?tab=references`)
  }

  function reportFailure(payload: VoucherErrorPayload, fallback: string) {
    const message = payload.error ?? fallback
    setFailure(message)
    const missingReferences = payload.details?.failures?.some(
      (item) => item.code === "leg_references_missing",
    )
    if (missingReferences) {
      toast.error(message, { action: { label: "Fix now", onClick: goToVoucherReferences } })
    } else {
      toast.error(message)
    }
  }

  async function prepareVoucher() {
    const run = ++runId.current
    setPreparing(true)
    setFailure(null)
    try {
      const generateResponse = await fetch("/api/voucher/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      })
      const generated = (await generateResponse.json().catch(() => ({}))) as GenerateVoucherResponse
      if (run !== runId.current) return
      if (!generateResponse.ok) {
        reportFailure(generated, "Voucher could not be generated")
        return
      }
      await onGenerated?.()
      const voucherId = generated.voucherRecord?.id
      if (!voucherId) {
        reportFailure({}, "Voucher could not be generated")
        return
      }

      const prepareResponse = await fetch(`/api/vouchers/${voucherId}/prepare-send`, { method: "POST" })
      const send = (await prepareResponse.json().catch(() => ({}))) as PrepareSendResponse
      if (run !== runId.current) return
      if (!prepareResponse.ok || !send.email) {
        reportFailure(send, "Voucher email could not be prepared")
        return
      }

      setPrepared({
        send,
        warnings: generated.readinessWarnings ?? [],
        pdf: generated.voucher ?? null,
      })
      // Hand off to the send-preview dialog as its own, single dialog — not
      // stacked behind this one, matching how the deposit/final invoice flow
      // (GenerateDepositInvoiceDialog) closes its own form before previewing.
      onOpenChange(false)
      setPreviewOpen(true)
    } catch (error) {
      if (run !== runId.current) return
      reportFailure({ error: error instanceof Error ? error.message : undefined }, "Voucher could not be prepared")
    } finally {
      if (run === runId.current) setPreparing(false)
    }
  }

  // Opening the dialog is the send action, so start as soon as the preflight clears. Waits for it
  // rather than firing into a known 422, which would swap the blocker below for a bare toast.
  const autoStarted = useRef(false)
  useEffect(() => {
    if (!open) {
      autoStarted.current = false
      runId.current += 1
      return
    }
    if (autoStarted.current || !legReferences || blockedOnReferences) return
    autoStarted.current = true
    void prepareVoucher()
    // Only re-run when the dialog opens or the preflight resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, legReferences, blockedOnReferences])

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) runId.current += 1
    onOpenChange(nextOpen)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send travel voucher</DialogTitle>
            <DialogDescription>
              Every preview rebuilds the voucher PDF for {displayNumber} from the latest booking
              details, so changes made since the last one are always included.
            </DialogDescription>
          </DialogHeader>

          {blockedOnReferences ? (
            <Alert variant="destructive" id={BLOCKER_ID}>
              <AlertCircle className="size-4" aria-hidden />
              <AlertTitle>
                {missingReferenceLabels.length}{" "}
                {missingReferenceLabels.length === 1 ? "leg is" : "legs are"} missing a supplier
                reference number
              </AlertTitle>
              <AlertDescription>
                <div className="flex flex-col items-start gap-3">
                  <div>
                    <p>A voucher can&apos;t be generated until every leg has one:</p>
                    <ul className="mt-1 list-disc pl-4">
                      {missingReferenceLabels.map((label) => (
                        <li key={label}>{label}</li>
                      ))}
                    </ul>
                  </div>
                  <Button size="sm" variant="outline" onClick={goToVoucherReferences}>
                    Add reference numbers
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : failure && !preparing ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" aria-hidden />
              <AlertTitle>The voucher couldn&apos;t be prepared</AlertTitle>
              <AlertDescription>
                <p>{failure}</p>
                <p className="mt-1">Fix the issue on the booking, then try again.</p>
              </AlertDescription>
            </Alert>
          ) : (
            <div
              className="flex min-h-16 items-center gap-3 rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              {preparing || checkingReferences ? (
                <>
                  <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                  <span>{preparing ? "Preparing voucher…" : "Checking supplier reference numbers…"}</span>
                </>
              ) : (
                <span>The voucher email opens for review before anything is sent to the customer.</span>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Close
            </Button>
            <Button
              onClick={() => void prepareVoucher()}
              disabled={preparing || blockedOnReferences}
              aria-describedby={blockedOnReferences ? BLOCKER_ID : undefined}
            >
              {preparing ? (
                <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden />
              ) : (
                <Send data-icon="inline-start" aria-hidden />
              )}
              {preparing ? "Preparing voucher…" : "Preview & Send Voucher"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {prepared ? (
        <PreviewAndSendDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          title="Send travel voucher"
          description={`Voucher for ${displayNumber} — review before sending.`}
          bookingId={prepared.send.voucher.jobId}
          initialSubject={prepared.send.email.subject}
          bodyHtml={prepared.send.email.bodyHtml}
          bodyContentHtml={prepared.send.email.bodyContentHtml}
          signatureProfileId={prepared.send.email.signatureProfileId}
          signatureBrandId={prepared.send.email.signatureBrandId}
          to={prepared.send.email.to}
          kind="voucher"
          moveStage="voucher_sent"
          voucherId={prepared.send.voucher.id}
          attachments={prepared.send.attachments}
          notice={<VoucherPreviewNotice warnings={prepared.warnings} pdf={prepared.pdf} />}
          onSent={async () => {
            await onSent()
          }}
        />
      ) : null}
    </>
  )
}
