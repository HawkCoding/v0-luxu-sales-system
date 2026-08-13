"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { FileText, Send } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { PreviewAndSendDialog } from "@/components/preview-and-send-dialog"
import type { Invoice, Quote } from "@/lib/types"
import { formatMoney } from "@/lib/money"

interface GenerateDepositInvoiceDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: boolean
  jobId: string
  bookingNumber: string
  invoiceNumber?: string | null
  customerName: string
  quotes: Quote[]
  defaultDepositPercentage: number
  /** Booking's departure date — drives the Pay in full default (inside 60 days). */
  departureDate?: string | null
  /**
   * An existing draft (generated but unsent) deposit or full-payment invoice.
   * When present the dialog switches to resume mode: no percentage/mode form
   * — the API reuses the draft — and the action re-opens the preview/send
   * step for it.
   */
  draftInvoice?: Invoice | null
  /**
   * True when the booking's live invoice was priced off a quote that has since
   * been superseded — the action re-issues that same invoice at the new total.
   */
  amending?: boolean
  /**
   * Skip the resume-mode confirmation card and go straight to preview — used
   * when the dialog was opened because the only thing left to do is send the
   * already-generated draft (e.g. a stage move that's otherwise ready).
   */
  autoPreview?: boolean
  onSent: () => Promise<void> | void
  /** Called after "Change amount" voids the draft, so the caller can refetch. */
  onDraftDiscarded?: () => Promise<void> | void
}

interface GenerateDepositInvoiceResponse {
  invoice: Invoice
  email: {
    to: string
    subject: string
    bodyHtml: string
    bodyContentHtml?: string
    warnings?: string[]
    signatureProfileId?: string | null
    signatureBrandId?: string | null
  }
  attachment?: {
    filename: string
    contentBase64: string
    contentType?: string
  }
  error?: string
}

function latestPricedQuote(quotes: Quote[]): Quote | null {
  return quotes
    .filter((quote) => quote.total > 0)
    .slice()
    .sort((left, right) => {
      const leftTime = left.updatedAt ? new Date(left.updatedAt).getTime() : 0
      const rightTime = right.updatedAt ? new Date(right.updatedAt).getTime() : 0
      return rightTime - leftTime
    })[0] ?? null
}

function addDays(date: Date, days: number): string {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next.toISOString().slice(0, 10)
}

/** Inside 60 days of departure the sales team's terms require full payment upfront. */
function isInsideSixtyDays(departureDate: string | null | undefined): boolean {
  if (!departureDate) return false
  const day = departureDate.slice(0, 10)
  const parsed = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return false
  const sixtyDaysOut = addDays(new Date(), 60)
  return day <= sixtyDaysOut
}

export function GenerateDepositInvoiceDialog({
  open,
  onOpenChange,
  trigger = true,
  jobId,
  bookingNumber,
  invoiceNumber,
  customerName,
  quotes,
  defaultDepositPercentage,
  departureDate = null,
  draftInvoice = null,
  amending = false,
  autoPreview = false,
  onSent,
  onDraftDiscarded,
}: GenerateDepositInvoiceDialogProps) {
  const displayNumber = invoiceNumber || bookingNumber
  const [internalOpen, setInternalOpen] = useState(false)
  const [percentage, setPercentage] = useState(String(defaultDepositPercentage))
  const insideSixtyDays = useMemo(() => isInsideSixtyDays(departureDate), [departureDate])
  const [payInFull, setPayInFull] = useState(insideSixtyDays)
  const [fullDueDate, setFullDueDate] = useState(() => addDays(new Date(), 2))
  const [generating, setGenerating] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  // Set by "Change amount": the draft has been voided, so the dialog leaves
  // resume mode and shows the mode/percentage form again.
  const [draftDiscarded, setDraftDiscarded] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [generated, setGenerated] = useState<GenerateDepositInvoiceResponse | null>(null)
  const dialogOpen = open ?? internalOpen
  const setDialogOpen = onOpenChange ?? setInternalOpen
  const quote = useMemo(() => latestPricedQuote(quotes), [quotes])
  const numericPercentage = Number(percentage)
  const validPercentage = Number.isFinite(numericPercentage)
    ? Math.min(100, Math.max(0, numericPercentage))
    : defaultDepositPercentage
  const amountPreview = quote ? quote.total * (validPercentage / 100) : 0
  const resumingDraft = draftInvoice !== null && !draftDiscarded
  const resumingFull = resumingDraft && draftInvoice?.kind === "full"
  const isFullMode = resumingDraft ? resumingFull : payInFull

  async function discardDraft() {
    if (!draftInvoice) return

    setDiscarding(true)
    try {
      const response = await fetch("/api/invoices/deposit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: draftInvoice.id, status: "void" }),
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error ?? "Draft invoice could not be discarded")
      }

      setPercentage(String(draftInvoice.depositPercentage ?? defaultDepositPercentage))
      setPayInFull(draftInvoice.kind === "full")
      setDraftDiscarded(true)
      await onDraftDiscarded?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Draft invoice could not be discarded")
    } finally {
      setDiscarding(false)
    }
  }

  async function generateInvoice() {
    if (!quote) {
      toast.error("A priced quote is required before generating an invoice")
      return
    }

    setGenerating(true)
    try {
      const response = await fetch("/api/invoices/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          mode: isFullMode ? "full" : "deposit",
          // The API reuses an existing draft, so pass its percentage when resuming.
          depositPercentage: isFullMode
            ? 100
            : resumingDraft
              ? draftInvoice?.depositPercentage ?? defaultDepositPercentage
              : validPercentage,
          ...(isFullMode && !resumingDraft ? { dueDate: fullDueDate } : {}),
        }),
      })
      const payload = (await response.json()) as GenerateDepositInvoiceResponse

      if (!response.ok) {
        throw new Error(payload.error ?? "Invoice could not be generated")
      }

      setGenerated(payload)
      setDialogOpen(false)
      setPreviewOpen(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invoice could not be generated")
    } finally {
      setGenerating(false)
    }
  }

  // autoPreview: skip straight to the preview step for an already-generated
  // draft, same as clicking "Preview & Send" — no need to re-render the
  // resume card first. Guarded with a ref so a re-render (or the preview
  // closing back to the form) doesn't re-fire the request.
  const autoPreviewFired = useRef(false)
  useEffect(() => {
    if (!dialogOpen) {
      autoPreviewFired.current = false
      return
    }
    if (!autoPreview || !resumingDraft || autoPreviewFired.current || generating) return
    autoPreviewFired.current = true
    void generateInvoice()
    // Only re-run when the dialog opens or the draft to resume changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, autoPreview, resumingDraft])

  async function handleSent() {
    if (!generated) return

    const response = await fetch("/api/invoices/deposit", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoiceId: generated.invoice.id,
        status: "sent",
      }),
    })
    if (!response.ok) {
      toast.error("Invoice email sent, but invoice status could not be updated")
    }
    await onSent()
  }

  return (
    <>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        {trigger ? (
          <DialogTrigger asChild>
            <Button size="sm">
              {resumingDraft ? <Send data-icon="inline-start" /> : <FileText data-icon="inline-start" />}
              {resumingDraft
                ? resumingFull
                  ? "Preview & Send Invoice"
                  : "Preview & Send Deposit Invoice"
                : amending
                  ? "Amend & Resend Invoice"
                  : "Generate Invoice"}
            </Button>
          </DialogTrigger>
        ) : null}
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {resumingDraft
                ? resumingFull
                  ? "Send invoice"
                  : "Send deposit invoice"
                : amending
                  ? "Amend and resend invoice"
                  : "Generate invoice"}
            </DialogTitle>
            <DialogDescription>
              {resumingDraft
                ? `${draftInvoice?.invoiceNumber} was generated but has not been sent. Preview and send it to the customer.`
                : amending
                  ? `The quote for ${displayNumber} has been revised. Re-issue the same invoice at the new total — any payment already received stays on record and is shown on the PDF.`
                  : `Create a draft invoice for ${displayNumber}, then preview and send it.`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {!resumingDraft ? (
              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div className="flex flex-col gap-0.5">
                  <Label htmlFor="pay-in-full">Pay in full</Label>
                  <span className="text-xs text-muted-foreground">
                    {insideSixtyDays
                      ? "Departure is within 60 days — full payment is due, no deposit split."
                      : "One invoice for the full amount instead of a deposit + final split."}
                  </span>
                </div>
                <Switch id="pay-in-full" checked={payInFull} onCheckedChange={setPayInFull} />
              </div>
            ) : null}
            {!resumingDraft && !payInFull ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="deposit-percentage">Deposit percentage</Label>
                <Input
                  id="deposit-percentage"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={percentage}
                  onChange={(event) => setPercentage(event.target.value)}
                />
              </div>
            ) : null}
            {!resumingDraft && payInFull ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="full-due-date">Due date</Label>
                <Input
                  id="full-due-date"
                  type="date"
                  value={fullDueDate}
                  onChange={(event) => setFullDueDate(event.target.value)}
                />
              </div>
            ) : null}
            <div className="rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Customer</span>
                <span className="font-medium">{customerName || "Traveller"}</span>
              </div>
              {resumingDraft ? (
                <>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Invoice</span>
                    <span className="font-medium">{draftInvoice?.invoiceNumber}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">
                      {resumingFull ? "Full amount" : `Deposit (${draftInvoice?.depositPercentage ?? "-"}%)`}
                    </span>
                    <span className="font-semibold">
                      {draftInvoice ? formatMoney(draftInvoice.amount, draftInvoice.currency) : "-"}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Quote total</span>
                    <span className="font-medium">{quote ? formatMoney(quote.total, quote.currency) : "-"}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{payInFull ? "Full amount" : "Deposit amount"}</span>
                    <span className="font-semibold">
                      {quote ? formatMoney(payInFull ? quote.total : amountPreview, quote.currency) : "-"}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={generating || discarding}>
              Cancel
            </Button>
            {resumingDraft ? (
              <Button variant="outline" onClick={discardDraft} disabled={generating || discarding}>
                {discarding ? "Discarding..." : "Change amount"}
              </Button>
            ) : null}
            <Button onClick={generateInvoice} disabled={generating || discarding || !quote}>
              {generating
                ? resumingDraft
                  ? "Preparing..."
                  : "Generating..."
                : resumingDraft
                  ? "Preview & Send"
                  : amending
                    ? "Amend & Preview"
                    : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {generated ? (
        <PreviewAndSendDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          title={isFullMode ? "Preview and send invoice" : "Preview and send deposit invoice"}
          description={`Review ${generated.invoice.invoiceNumber} before sending it to the customer.`}
          bookingId={jobId}
          initialSubject={generated.email.subject}
          bodyHtml={generated.email.bodyHtml}
          bodyContentHtml={generated.email.bodyContentHtml}
          signatureProfileId={generated.email.signatureProfileId}
          signatureBrandId={generated.email.signatureBrandId}
          to={generated.email.to}
          kind="invoice"
          moveStage="deposit_requested"
          attachments={generated.attachment ? [generated.attachment] : undefined}
          onSent={handleSent}
        />
      ) : null}
    </>
  )
}
