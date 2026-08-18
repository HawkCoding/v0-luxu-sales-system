"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import type { Quote } from "@/lib/types"
import {
  hasComplimentaryNight,
  isComplimentaryRoom,
  isMissingPricing,
  stayNights,
} from "@/lib/quotes/pricing-engine"
import { useRole } from "@/lib/role-context"
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/date-format"
import { formatMoney } from "@/lib/money"
import { ConvertQuoteCurrencyDialog } from "@/components/quotes/convert-quote-currency-dialog"
import { FxProvenanceNote } from "@/components/quotes/fx-provenance-note"
import { RoomOverrideNote } from "@/components/quotes/room-override-note"
import { TransportOverrideNote } from "@/components/quotes/transport-override-note"
import { QUOTE_VALIDITY_ENABLED } from "@/lib/feature-flags"
import { BuildBookingDialog } from "@/components/build-booking-dialog"
import { CreateQuoteDialog } from "@/components/create-quote-dialog"
import { QuotePreviewSendDialog } from "@/components/quote-preview-send-dialog"
import { ReviseQuoteDialog } from "@/components/revise-quote-dialog"
import { CommissionBonusField } from "@/components/quotes/commission-bonus-field"
import { getCommissionBonus } from "@/lib/quotes/apply-commission-bonus"
import { formatQuoteDisplayLabel } from "@/lib/quotes/quote-number"
import { FileDown, Loader2, Mail, Trash2, X } from "lucide-react"

const EDITABLE_QUOTE_STATUSES = ["draft", "pricing_incomplete", "ready"]

/** Statuses whose services can still be rebuilt. Mirrors LOCKED_QUOTE_STATUSES in
 * app/api/quotes/[id]/route.ts — an accepted quote is the record of what was sold, so changing
 * it goes through Revise instead. */
const BUILDABLE_QUOTE_STATUSES = [...EDITABLE_QUOTE_STATUSES, "sent", "expired"]

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
  customerName: string
  emailImportNeedsReview?: boolean
  mutate: () => void
  autoOpenBuildBookingQuoteId?: string | null
  onAutoOpenBuildBookingHandled?: () => void
}

export function JobQuotesTab({
  quotes,
  jobId,
  bookingNumber,
  travelDate,
  customerName,
  emailImportNeedsReview = false,
  mutate,
  autoOpenBuildBookingQuoteId: externalAutoOpenBuildBookingQuoteId = null,
  onAutoOpenBuildBookingHandled,
}: JobQuotesTabProps) {
  const { can } = useRole()
  const [previewSendOpen, setPreviewSendOpen] = useState(false)
  const [cancellingQuoteId, setCancellingQuoteId] = useState<string | null>(null)
  const [generatingPdfForId, setGeneratingPdfForId] = useState<string | null>(null)
  const [removingLineKey, setRemovingLineKey] = useState<string | null>(null)
  const [autoOpenBuildBookingQuoteId, setAutoOpenBuildBookingQuoteId] = useState<string | null>(null)

  useEffect(() => {
    if (externalAutoOpenBuildBookingQuoteId) {
      setAutoOpenBuildBookingQuoteId(externalAutoOpenBuildBookingQuoteId)
    }
  }, [externalAutoOpenBuildBookingQuoteId])

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
  // Quotes arrive oldest-first from the API; the send button targets the newest sendable one.
  const latestSendableQuote =
    [...quotes].reverse().find((q) => EDITABLE_QUOTE_STATUSES.includes(q.status)) ?? null

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
            <CreateQuoteDialog
              jobId={jobId}
              onCreated={(quoteId) => {
                mutate()
                setAutoOpenBuildBookingQuoteId(quoteId)
              }}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {can("edit:quotes") && (
        <div className="flex justify-end gap-2">
          <CreateQuoteDialog
            jobId={jobId}
            onCreated={(quoteId) => {
              mutate()
              setAutoOpenBuildBookingQuoteId(quoteId)
            }}
          />
          <Button
            size="sm"
            disabled={!latestSendableQuote}
            title={latestSendableQuote ? undefined : "Create a quote first"}
            onClick={() => setPreviewSendOpen(true)}
          >
            <Mail className="w-3.5 h-3.5 mr-1.5" />
            Preview & Send
          </Button>
        </div>
      )}
      {latestSendableQuote && (
        <QuotePreviewSendDialog
          quote={latestSendableQuote}
          bookingNumber={bookingNumber}
          customerName={customerName}
          emailImportNeedsReview={emailImportNeedsReview}
          open={previewSendOpen}
          onOpenChange={setPreviewSendOpen}
          onSent={mutate}
        />
      )}
      {quotes.map(q => {
        const badge = STATUS_BADGE[q.status] || { variant: "outline" as const, label: q.status }
        const hasIncomplete = q.lineItems.some(isMissingPricing)
        const canEditLines = can("edit:quotes") && EDITABLE_QUOTE_STATUSES.includes(q.status)

        return (
          <Card key={q.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-medium" title={q.quoteNumber || undefined}>
                    {formatQuoteDisplayLabel(q.quoteNumber)}
                  </CardTitle>
                  <Badge variant={badge.variant} className={`text-[10px] ${badge.className ?? ""}`}>{badge.label}</Badge>
                  {hasIncomplete && <Badge variant="destructive" className="text-[10px]">Missing pricing</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  {QUOTE_VALIDITY_ENABLED && (
                    <span className="text-xs text-muted-foreground">Valid until {formatDisplayDate(q.validityUntil)}</span>
                  )}
                  {can("edit:quotes") && (
                    <>
                      {(q.status === "sent" || q.status === "accepted" || q.status === "expired") && (
                        <ReviseQuoteDialog
                          quoteId={q.id}
                          quoteNumber={q.quoteNumber || "quote"}
                          onRevised={mutate}
                        />
                      )}
                      {!["cancelled", "superseded", "expired"].includes(q.status) && (
                        <ConvertQuoteCurrencyDialog
                          quoteId={q.id}
                          currency={q.currency}
                          lineItems={q.lineItems}
                          total={q.total}
                          requiresRevision={!["draft", "pricing_incomplete"].includes(q.status)}
                          onConverted={mutate}
                        />
                      )}
                      {BUILDABLE_QUOTE_STATUSES.includes(q.status) && (
                        <BuildBookingDialog
                          jobId={jobId}
                          quoteId={q.id}
                          quoteCurrency={q.currency}
                          travelDate={travelDate}
                          existingLineItemCount={q.lineItems.length}
                          existingLineItems={q.lineItems}
                          expectedUpdatedAt={q.updatedAt}
                          onApplied={mutate}
                          autoOpen={autoOpenBuildBookingQuoteId === q.id}
                          onAutoOpenHandled={() => {
                            setAutoOpenBuildBookingQuoteId(null)
                            onAutoOpenBuildBookingHandled?.()
                          }}
                        />
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
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full table-fixed text-sm" style={{ fontFamily: "var(--font-inter)" }}>
                  <thead>
                    <tr className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
                      <th className="pb-2 w-[40%]">Description</th>
                      <th className="pb-2 pl-4 text-right w-16">Qty</th>
                      <th className="pb-2 pl-6 text-right w-28">Unit Price</th>
                      <th className="pb-2 pl-6 text-right w-28">Total</th>
                      {canEditLines && <th className="pb-2 w-8" aria-label="Actions" />}
                    </tr>
                  </thead>
                  <tbody>
                    {q.lineItems.map((li, i) => {
                      const isExtra = li.pricingSnapshot?.isExtra === true
                      const isComplimentary = isComplimentaryRoom(li)
                      const lineBonus = getCommissionBonus(li)
                      return (
                      <tr key={i} className="border-b border-border/50 last:border-0">
                        <td className="py-2 text-xs text-foreground break-words">
                          {li.description}
                          {isExtra ? (
                            <Badge variant="outline" className="ml-1.5 text-[9px] align-middle">Extra</Badge>
                          ) : null}
                          {lineBonus > 0 ? (
                            // Internal-only split. The stored description stays plain "Commission"
                            // so the client-facing invoice line doesn't expose the top-up.
                            <div className="text-[10px] text-muted-foreground">
                              {formatMoney(li.total - lineBonus, q.currency)} calculated +{" "}
                              {formatMoney(lineBonus, q.currency)} added
                            </div>
                          ) : null}
                          {/* Internal only — the client's PDF and email show the converted
                              figure alone. See components/quotes/fx-provenance-note.tsx. */}
                          <FxProvenanceNote snapshot={li.pricingSnapshot ?? null} />
                          {/* Also internal only — see components/quotes/room-override-note.tsx. */}
                          <RoomOverrideNote snapshot={li.pricingSnapshot ?? null} quoteCurrency={q.currency} />
                          <TransportOverrideNote snapshot={li.pricingSnapshot ?? null} quoteCurrency={q.currency} />
                        </td>
                        <td className="py-2 pl-4 text-xs text-right text-muted-foreground">
                          <div>{li.qty}</div>
                          {li.pricingSnapshot?.unit ? (
                            <div className="text-[10px] text-muted-foreground">{li.pricingSnapshot.unit}</div>
                          ) : null}
                          {/* qty is the charged nights once a night was gifted — the stay itself
                              is longer, and the client documents still say so. */}
                          {hasComplimentaryNight(li) ? (
                            <div className="text-[10px] text-emerald-600 dark:text-emerald-500">
                              of {stayNights(li)}
                            </div>
                          ) : null}
                        </td>
                        <td
                          className={`py-2 pl-6 text-xs text-right ${
                            isMissingPricing(li) ? "text-destructive font-medium" : "text-muted-foreground"
                          }`}
                        >
                          {li.unitPrice === 0 && !isComplimentary
                            ? isMissingPricing(li)
                              ? "TBD"
                              : "Included"
                            : formatMoney(li.unitPrice, q.currency)}
                        </td>
                        <td className="py-2 pl-6 text-xs text-right text-foreground font-medium">
                          {formatMoney(li.total, q.currency)}
                        </td>
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
              {(canEditLines || (q.commissionBonus ?? 0) > 0) && (
                <div className="mt-3">
                  <CommissionBonusField quote={q} editable={canEditLines} onSaved={mutate} />
                </div>
              )}
              <Separator className="my-3" />
              <div className="space-y-1 text-right">
                <div className="flex justify-end gap-8 text-xs">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="text-foreground font-medium w-28">
                    {formatMoney(q.subtotal, q.currency)}
                  </span>
                </div>
                <div className="flex justify-end gap-8 text-sm font-semibold">
                  <span className="text-foreground">Total</span>
                  <span className="text-foreground w-28">{formatMoney(q.total, q.currency)}</span>
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
