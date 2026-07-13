"use client"

import { useEffect, useMemo, useState } from "react"
import { FileText } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { PreviewAndSendDialog } from "@/components/preview-and-send-dialog"
import type { Invoice, Payment, Quote } from "@/lib/types"

interface GenerateFinalInvoiceDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: boolean
  jobId: string
  bookingNumber: string
  customerName: string
  quotes: Quote[]
  payments: Payment[]
  onSent: () => Promise<void> | void
}

interface GenerateFinalInvoiceResponse {
  invoice: Invoice
  balance: {
    quoteTotal: number
    totalPaid: number
    calculatedBalance: number
  }
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

function calculateBalance(quotes: Quote[], payments: Payment[]): number {
  const quote = latestPricedQuote(quotes)
  if (!quote) return 0

  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0)
  return Math.max(0, Math.round((quote.total - totalPaid) * 100) / 100)
}

export function GenerateFinalInvoiceDialog({
  open,
  onOpenChange,
  trigger = true,
  jobId,
  bookingNumber,
  customerName,
  quotes,
  payments,
  onSent,
}: GenerateFinalInvoiceDialogProps) {
  const calculatedBalance = useMemo(() => calculateBalance(quotes, payments), [payments, quotes])
  const [internalOpen, setInternalOpen] = useState(false)
  const [amount, setAmount] = useState(String(calculatedBalance))
  const [generating, setGenerating] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [generated, setGenerated] = useState<GenerateFinalInvoiceResponse | null>(null)
  const dialogOpen = open ?? internalOpen
  const setDialogOpen = onOpenChange ?? setInternalOpen
  const quote = useMemo(() => latestPricedQuote(quotes), [quotes])
  const numericAmount = Number(amount)
  const validAmount = Number.isFinite(numericAmount) ? Math.max(0, numericAmount) : calculatedBalance
  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0)
  const amountDiffers = Math.abs(validAmount - calculatedBalance) >= 0.01

  useEffect(() => {
    if (dialogOpen) {
      setAmount(String(calculatedBalance))
    }
  }, [calculatedBalance, dialogOpen])

  async function generateInvoice() {
    if (!quote) {
      toast.error("A priced quote is required before generating a final invoice")
      return
    }

    setGenerating(true)
    try {
      const response = await fetch("/api/invoices/final", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          amount: validAmount,
        }),
      })
      const payload = (await response.json()) as GenerateFinalInvoiceResponse

      if (!response.ok) {
        throw new Error(payload.error ?? "Final invoice could not be generated")
      }

      setGenerated(payload)
      setDialogOpen(false)
      setPreviewOpen(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Final invoice could not be generated")
    } finally {
      setGenerating(false)
    }
  }

  async function handleSent() {
    if (!generated) return

    const response = await fetch("/api/invoices/final", {
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
            <Button size="sm" variant="outline">
              <FileText data-icon="inline-start" />
              Generate Final Invoice
            </Button>
          </DialogTrigger>
        ) : null}
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate final invoice</DialogTitle>
            <DialogDescription>
              Create a draft balance invoice for {bookingNumber}, then preview and send it.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="final-invoice-amount">Invoice amount</Label>
              <Input
                id="final-invoice-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div className="rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Customer</span>
                <span className="font-medium">{customerName || "Traveller"}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Quote total</span>
                <span className="font-medium">{quote ? formatMoney(quote.total) : "-"}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Payments received</span>
                <span className="font-medium">{formatMoney(totalPaid)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Calculated balance</span>
                <span className="font-semibold">{quote ? formatMoney(calculatedBalance) : "-"}</span>
              </div>
            </div>
            {amountDiffers ? (
              <Alert>
                <AlertDescription>
                  The invoice amount differs from the calculated balance of {formatMoney(calculatedBalance)}.
                </AlertDescription>
              </Alert>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={generating}>
              Cancel
            </Button>
            <Button onClick={generateInvoice} disabled={generating || !quote}>
              {generating ? "Generating..." : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {generated ? (
        <PreviewAndSendDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          title="Preview and send final invoice"
          description={`Review ${generated.invoice.invoiceNumber} before sending it to the customer.`}
          bookingId={jobId}
          initialSubject={generated.email.subject}
          bodyHtml={generated.email.bodyHtml}
          bodyContentHtml={generated.email.bodyContentHtml}
          to={generated.email.to}
          kind="invoice"
          attachments={generated.attachment ? [generated.attachment] : undefined}
          onSent={handleSent}
        />
      ) : null}
    </>
  )
}
