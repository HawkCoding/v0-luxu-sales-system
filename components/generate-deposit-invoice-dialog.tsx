"use client"

import { useMemo, useState } from "react"
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

interface GenerateDepositInvoiceDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: boolean
  jobId: string
  bookingNumber: string
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
  onSent: () => Promise<void> | void
}

interface GenerateDepositInvoiceResponse {
  invoice: Invoice
  email: {
    to: string
    subject: string
    bodyHtml: string
    bodyContentHtml?: string
    warnings?: string[]
  }
  attachment?: {
    filename: string
    contentBase64: string
    contentType?: string
  }
  error?: string
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 2,
  }).format(amount)
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
  customerName,
  quotes,
  defaultDepositPercentage,
  departureDate = null,
  draftInvoice = null,
  onSent,
}: GenerateDepositInvoiceDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [percentage, setPercentage] = useState(String(defaultDepositPercentage))
  const insideSixtyDays = useMemo(() => isInsideSixtyDays(departureDate), [departureDate])
  const [payInFull, setPayInFull] = useState(insideSixtyDays)
  const [fullDueDate, setFullDueDate] = useState(() => addDays(new Date(), 2))
  const [generating, setGenerating] = useState(false)
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
  const resumingDraft = draftInvoice !== null
  const resumingFull = resumingDraft && draftInvoice?.kind === "full"
  const isFullMode = resumingDraft ? resumingFull : payInFull

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
                : "Generate Deposit Invoice"}
            </Button>
          </DialogTrigger>
        ) : null}
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {resumingDraft ? (resumingFull ? "Send invoice" : "Send deposit invoice") : "Generate invoice"}
            </DialogTitle>
            <DialogDescription>
              {resumingDraft
                ? `${draftInvoice?.invoiceNumber} was generated but has not been sent. Preview and send it to the customer.`
                : `Create a draft invoice for ${bookingNumber}, then preview and send it.`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {!resumingDraft ? (
              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div className="flex flex-col gap-0.5">
                  <Label htmlFor="pay-in-full">Pay in full</Label>
                  <span className="text-xs text-muted-foreground">
                    {insideSixtyDays
                      ? "Departure is within 60 days — full payment is due, no deposit required."
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
                      {draftInvoice ? formatMoney(draftInvoice.amount) : "-"}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Quote total</span>
                    <span className="font-medium">{quote ? formatMoney(quote.total) : "-"}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{payInFull ? "Full amount" : "Deposit amount"}</span>
                    <span className="font-semibold">
                      {quote ? formatMoney(payInFull ? quote.total : amountPreview) : "-"}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={generating}>
              Cancel
            </Button>
            <Button onClick={generateInvoice} disabled={generating || !quote}>
              {generating
                ? resumingDraft
                  ? "Preparing..."
                  : "Generating..."
                : resumingDraft
                  ? "Preview & Send"
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
