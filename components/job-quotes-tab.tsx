"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import type { Quote } from "@/lib/types"
import { useRole } from "@/lib/role-context"
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/date-format"
import { ApplyPackageDialog } from "@/components/apply-package-dialog"
import { AddQuoteLineDialog } from "@/components/add-quote-line-dialog"
import { SendQuoteDialog } from "@/components/send-quote-dialog"
import { CreateQuoteDialog } from "@/components/create-quote-dialog"
import { QuotePreviewSendDialog } from "@/components/quote-preview-send-dialog"
import { FileDown, Link2, Loader2, RotateCcw, Send, Trash2, X } from "lucide-react"

const EDITABLE_QUOTE_STATUSES = ["draft", "pricing_incomplete", "ready"]

const STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string; className?: string }> = {
  draft: { variant: "secondary", label: "Provisional" },
  pricing_incomplete: { variant: "outline", label: "Provisional (Incomplete)" },
  ready: { variant: "default", label: "Provisional" },
  sent: { variant: "default", label: "Sent" },
  accepted: { variant: "default", label: "Accepted" },
  expired: { variant: "outline", label: "Expired", className: "border-amber-400 text-amber-600 bg-amber-50" },
  superseded: { variant: "secondary", label: "Superseded" },
  cancelled: { variant: "destructive", label: "Cancelled" },
}

interface JobQuotesTabProps {
  quotes: Quote[]
  jobId: string
  bookingNumber: string
  travelDate: string | null
  noOfAdults: number
  noOfChildren: number
  customerName: string
  customerDefaultRateTypeId?: string | null
  emailImportNeedsReview?: boolean
  mutate: () => void
}

export function JobQuotesTab({
  quotes,
  jobId,
  bookingNumber,
  travelDate,
  noOfAdults,
  noOfChildren,
  customerName,
  customerDefaultRateTypeId,
  emailImportNeedsReview = false,
  mutate,
}: JobQuotesTabProps) {
  const { can } = useRole()
  const [sendQuoteOpen, setSendQuoteOpen] = useState(false)
  const [revisingQuoteId, setRevisingQuoteId] = useState<string | null>(null)
  const [cancellingQuoteId, setCancellingQuoteId] = useState<string | null>(null)
  const [generatingLinkForId, setGeneratingLinkForId] = useState<string | null>(null)
  const [generatingPdfForId, setGeneratingPdfForId] = useState<string | null>(null)
  const [removingLineKey, setRemovingLineKey] = useState<string | null>(null)

  async function removeLineItem(quote: Quote, index: number) {
    const key = `${quote.id}:${index}`
    setRemovingLineKey(key)
    try {
      const lineItems = quote.lineItems.filter((_, i) => i !== index)
      if (lineItems.length === 0) {
        toast.error("A quote needs at least one line. Cancel the quote instead.")
        return
      }
      const response = await fetch(`/api/quotes/${quote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineItems, expectedUpdatedAt: quote.updatedAt }),
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Failed to remove line")
      mutate()
      toast.success("Line removed.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove line")
    } finally {
      setRemovingLineKey(null)
    }
  }
  const sendQuoteDialog = (
    <SendQuoteDialog
      open={sendQuoteOpen}
      onOpenChange={setSendQuoteOpen}
      bookingId={jobId}
      bookingNumber={bookingNumber}
      departureDate={travelDate}
      noOfAdults={noOfAdults}
      noOfChildren={noOfChildren}
      customerName={customerName}
      emailImportNeedsReview={emailImportNeedsReview}
      onSent={() => {
        mutate()
        setSendQuoteOpen(false)
      }}
    />
  )

  async function reviseQuote(quoteId: string) {
    setRevisingQuoteId(quoteId)

    try {
      const response = await fetch(`/api/quotes/${quoteId}/revise`, { method: "POST" })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to revise quote")
      }

      mutate()
      toast.success("Quote revision created.")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to revise quote"
      toast.error(message)
    } finally {
      setRevisingQuoteId(null)
    }
  }

  async function cancelQuote(quoteId: string) {
    setCancellingQuoteId(quoteId)
    try {
      const response = await fetch(`/api/quotes/${quoteId}/cancel`, { method: "POST" })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Failed to cancel quote")
      mutate()
      toast.success("Quote cancelled.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel quote")
    } finally {
      setCancellingQuoteId(null)
    }
  }

  async function generateAcceptanceLink(quoteId: string) {
    setGeneratingLinkForId(quoteId)
    try {
      const response = await fetch(`/api/quotes/${quoteId}/acceptance-link`, { method: "POST" })
      const payload = (await response.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Failed to generate link")
      if (payload.url) {
        await navigator.clipboard.writeText(payload.url)
        toast.success("Acceptance link copied to clipboard.")
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate acceptance link")
    } finally {
      setGeneratingLinkForId(null)
    }
  }

  async function downloadPdf(quoteId: string) {
    setGeneratingPdfForId(quoteId)
    try {
      const response = await fetch(`/api/quotes/${quoteId}/pdf`, { method: "POST" })
      const payload = (await response.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Failed to generate PDF")
      if (payload.url) {
        window.open(payload.url, "_blank", "noopener,noreferrer")
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate quote PDF")
    } finally {
      setGeneratingPdfForId(null)
    }
  }

  if (quotes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-sm text-muted-foreground">No quotes yet</p>
        {can("edit:quotes") && (
          <div className="flex flex-wrap justify-center gap-2">
            <CreateQuoteDialog jobId={jobId} onCreated={mutate} />
            <Button size="sm" onClick={() => setSendQuoteOpen(true)}>
              <Send className="w-3.5 h-3.5 mr-1.5" />
              Send Quote
            </Button>
          </div>
        )}
        {sendQuoteDialog}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {can("edit:quotes") && (
        <div className="flex justify-end gap-2">
          <CreateQuoteDialog jobId={jobId} onCreated={mutate} />
          <Button size="sm" onClick={() => setSendQuoteOpen(true)}>
            <Send className="w-3.5 h-3.5 mr-1.5" />
            Send Quote
          </Button>
        </div>
      )}
      {sendQuoteDialog}
      {quotes.map(q => {
        const badge = STATUS_BADGE[q.status] || { variant: "outline" as const, label: q.status }
        const hasIncomplete = q.lineItems.some(li => li.unitPrice === 0)
        const canEditLines = can("edit:quotes") && EDITABLE_QUOTE_STATUSES.includes(q.status)

        return (
          <Card key={q.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-medium">{q.quoteNumber || "Quote"}</CardTitle>
                  <Badge variant={badge.variant} className={`text-[10px] ${badge.className ?? ""}`}>{badge.label}</Badge>
                  {hasIncomplete && <Badge variant="destructive" className="text-[10px]">Missing pricing</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Valid until {formatDisplayDate(q.validityUntil)}</span>
                  {can("edit:quotes") && (
                    <>
                      <QuotePreviewSendDialog
                        quote={q}
                        bookingNumber={bookingNumber}
                        customerName={customerName}
                        emailImportNeedsReview={emailImportNeedsReview}
                        onSent={mutate}
                      />
                      {(q.status === "sent" || q.status === "accepted" || q.status === "expired") && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={revisingQuoteId === q.id}
                          onClick={() => void reviseQuote(q.id)}
                        >
                          {revisingQuoteId === q.id ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Revise
                        </Button>
                      )}
                      {q.status === "sent" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={generatingLinkForId === q.id}
                          onClick={() => void generateAcceptanceLink(q.id)}
                        >
                          {generatingLinkForId === q.id ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Link2 className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Acceptance Link
                        </Button>
                      )}
                      {["draft", "pricing_incomplete", "ready", "sent"].includes(q.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={cancellingQuoteId === q.id}
                          onClick={() => void cancelQuote(q.id)}
                        >
                          {cancellingQuoteId === q.id ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <X className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Cancel
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={generatingPdfForId === q.id}
                        onClick={() => void downloadPdf(q.id)}
                      >
                        {generatingPdfForId === q.id ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <FileDown className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        PDF
                      </Button>
                      {EDITABLE_QUOTE_STATUSES.includes(q.status) && (
                        <AddQuoteLineDialog
                          quoteId={q.id}
                          expectedUpdatedAt={q.updatedAt}
                          existingLineItems={q.lineItems}
                          onAdded={mutate}
                        />
                      )}
                      <ApplyPackageDialog
                        jobId={jobId}
                        quoteId={q.id}
                        travelDate={travelDate}
                        existingLineItemCount={q.lineItems.length}
                        existingLineItems={q.lineItems}
                        expectedUpdatedAt={q.updatedAt}
                        customerDefaultRateTypeId={customerDefaultRateTypeId}
                        onApplied={mutate}
                      />
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ fontFamily: "var(--font-inter)" }}>
                  <thead>
                    <tr className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
                      <th className="pb-2">Description</th>
                      <th className="pb-2 text-right">Qty</th>
                      <th className="pb-2 text-right">Unit Price</th>
                      <th className="pb-2 text-right">Total</th>
                      {canEditLines && <th className="pb-2 w-8" aria-label="Actions" />}
                    </tr>
                  </thead>
                  <tbody>
                    {q.lineItems.map((li, i) => {
                      const isExtra = li.pricingSnapshot?.isExtra === true
                      return (
                      <tr key={i} className="border-b border-border/50 last:border-0">
                        <td className="py-2 text-xs text-foreground">
                          {li.description}
                          {isExtra ? (
                            <Badge variant="outline" className="ml-1.5 text-[9px] align-middle">Extra</Badge>
                          ) : null}
                        </td>
                        <td className="py-2 text-xs text-right text-muted-foreground">
                          <div>{li.qty}</div>
                          {li.pricingSnapshot?.unit ? (
                            <div className="text-[10px] text-muted-foreground">{li.pricingSnapshot.unit}</div>
                          ) : null}
                        </td>
                        <td className={`py-2 text-xs text-right ${li.unitPrice === 0 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                          {li.unitPrice === 0 ? "TBD" : `R ${li.unitPrice.toLocaleString()}`}
                        </td>
                        <td className="py-2 text-xs text-right text-foreground font-medium">R {li.total.toLocaleString()}</td>
                        {canEditLines && (
                          <td className="py-2 text-right">
                            <button
                              type="button"
                              aria-label={`Remove ${li.description}`}
                              className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                              disabled={removingLineKey === `${q.id}:${i}`}
                              onClick={() => void removeLineItem(q, i)}
                            >
                              {removingLineKey === `${q.id}:${i}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </td>
                        )}
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <Separator className="my-3" />
              <div className="space-y-1 text-right">
                <div className="flex justify-end gap-8 text-xs">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="text-foreground font-medium w-24">R {q.subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-end gap-8 text-xs">
                  <span className="text-muted-foreground">VAT (15%)</span>
                  <span className="text-foreground w-24">R {q.vat.toLocaleString()}</span>
                </div>
                <div className="flex justify-end gap-8 text-sm font-semibold">
                  <span className="text-foreground">Total</span>
                  <span className="text-foreground w-24">R {q.total.toLocaleString()}</span>
                </div>
              </div>
              {q.overrideReason && (
                <div className="mt-3 p-2 bg-payment-yellow/10 rounded-md">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "var(--font-inter)" }}>Pricing Override</p>
                  <p className="text-xs text-foreground mt-0.5">{q.overrideReason}</p>
                </div>
              )}
              {q.lastSentAt && (
                <p className="text-[10px] text-muted-foreground mt-2">Last sent: {formatDisplayDateTime(q.lastSentAt)}</p>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
