"use client"

import { useEffect, useState } from "react"
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import type { Quote } from "@/lib/types"
import {
  describeQtyBasis,
  hasComplimentaryNight,
  isComplimentaryLine,
  isDeliberateZeroCommission,
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
import { TourOverrideNote } from "@/components/quotes/tour-override-note"
import { TrainOverrideNote } from "@/components/quotes/train-override-note"
import { QUOTE_VALIDITY_ENABLED } from "@/lib/feature-flags"
import { BuildBookingDialog } from "@/components/build-booking-dialog"
import { CreateQuoteDialog } from "@/components/create-quote-dialog"
import { QuotePreviewSendDialog } from "@/components/quote-preview-send-dialog"
import { QuoteAdjustmentsLedger } from "@/components/quotes/quote-adjustments-ledger"
import { findCommissionLineIndex } from "@/lib/quotes/apply-commission-bonus"
import { describeLineDate } from "@/lib/quotes/line-item-date"
import { formatQuoteDisplayLabel } from "@/lib/quotes/quote-number"
import { amendIneligibilityReason, bookingEditIneligibilityReason } from "@/lib/quotes/amend-quote"
import { FileDown, Loader2, Mail, Trash2, TriangleAlert, X } from "lucide-react"

const EDITABLE_QUOTE_STATUSES = ["draft", "pricing_incomplete", "ready"]

/** Statuses whose services can still be rebuilt. Mirrors LOCKED_QUOTE_STATUSES in
 * app/api/quotes/[id]/route.ts — an accepted quote is the record of what was sold, so changing
 * it goes through Edit Booking (Build Booking in amend mode, confirmed) instead. Exported so the Enquiry tab's readiness panel can find a quote
 * to send Build Booking's primary action to, without re-deriving this rule. */
export const BUILDABLE_QUOTE_STATUSES = [...EDITABLE_QUOTE_STATUSES, "sent", "expired"]

const STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string; className?: string }> = {
  draft: { variant: "secondary", label: "Provisional" },
  pricing_incomplete: { variant: "outline", label: "Provisional (Incomplete)" },
  ready: { variant: "default", label: "Provisional" },
  sent: { variant: "default", label: "Sent" },
  accepted: { variant: "default", label: "Accepted" },
  expired: { variant: "outline", label: "Expired", className: "border-amber-400 text-amber-600 bg-amber-50" },
  superseded: { variant: "secondary", label: "Replaced" },
  cancelled: { variant: "destructive", label: "Cancelled" },
}

interface NextStepInput {
  status: string
  /** A line has no price yet (or the status itself says so). */
  hasPricingGap: boolean
  /** This card is the quote the top button sends. */
  isQuoteToSend: boolean
  sendButtonLabel: string
  /** The viewer can edit quotes at all. */
  canEdit: boolean
  /** The viewer can use Edit Booking on this booking (not read-only, booking not closed or cancelled). */
  canEditBooking: boolean
}

/** The one plain sentence under a card's header that says what to do with this quote next. Only
 *  ever names a button the viewer can actually see on this card or at the top of the tab. */
function describeNextStep({
  status,
  hasPricingGap,
  isQuoteToSend,
  sendButtonLabel,
  canEdit,
  canEditBooking,
}: NextStepInput): string | null {
  const isEditable = EDITABLE_QUOTE_STATUSES.includes(status)
  if (hasPricingGap) {
    if (isEditable) {
      return canEdit
        ? "Some services have no price yet. Use Edit Quote to price them before sending."
        : "Some services have no price yet."
    }
    return canEditBooking
      ? "Some services have no price yet. Use Edit Booking to price them."
      : "Some services have no price yet."
  }
  if (isEditable) {
    if (!isQuoteToSend) return null
    return canEdit
      ? `Not sent yet. Check the services, then use ${sendButtonLabel}.`
      : "Not sent yet."
  }
  if (status === "sent") {
    return canEditBooking
      ? "Waiting for the client. To change services, dates or guests, use Edit Booking, then send them an updated quote."
      : "Waiting for the client."
  }
  if (status === "accepted") {
    return canEditBooking
      ? "Accepted. To change services, dates or guests, use Edit Booking. Nothing is emailed until you send an update."
      : null
  }
  return null
}

interface JobQuotesTabProps {
  quotes: Quote[]
  jobId: string
  bookingNumber: string
  travelDate: string | null
  customerName: string
  /** The booking's current headcount (adults + children, infants excluded) — what a per-person
   *  Commission/Discount on the adjustments ledger is multiplied by. */
  bookingHeadcount: number
  emailImportNeedsReview?: boolean
  /** The booking's pipeline stage and cancellation stamp — Amend is hidden on a closed, lost or
   *  cancelled booking, by the same rule the PATCH route enforces (amendIneligibilityReason). */
  bookingStage?: string | null
  bookingCancelledAt?: string | null
  /** True when a quote email has actually gone to the client on this booking (an email record, not
   *  just a Sent/Accepted status, which seeded or imported rows can carry without any email).
   *  Absent: only a quote's own `lastSentAt` decides, so the send button reads "Updated Quote". */
  quoteEmailedBefore?: boolean
  /** True when the booking has changed since the quote the client holds was sent, so that quote's
   *  card warns the client may still have the old version. Absent or false: no warning. */
  quoteChangedSinceSent?: boolean
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
  bookingHeadcount,
  emailImportNeedsReview = false,
  bookingStage = null,
  bookingCancelledAt = null,
  quoteEmailedBefore,
  quoteChangedSinceSent,
  mutate,
  autoOpenBuildBookingQuoteId: externalAutoOpenBuildBookingQuoteId = null,
  onAutoOpenBuildBookingHandled,
}: JobQuotesTabProps) {
  const { can } = useRole()
  const [previewSendOpen, setPreviewSendOpen] = useState(false)
  const [quoteToCancel, setQuoteToCancel] = useState<Quote | null>(null)
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
  // With no draft left to send, the quote the client holds can still go out again after it has been
  // rebuilt: previously the button was disabled ("Create a quote first") and a sent quote that was
  // edited had no way to be re-sent from here. The server only moves the stage forward, so sending
  // an accepted quote again changes nothing about the booking.
  const currentIssuedQuote =
    latestSendableQuote === null
      ? ([...quotes].reverse().find((q) => q.status === "sent" || q.status === "accepted") ?? null)
      : null
  const quoteToSend = latestSendableQuote ?? currentIssuedQuote
  // "Updated Quote" means the client already holds an emailed quote, not that a quote's status
  // reads Sent or Accepted: seeded, imported and scripted rows carry those statuses with no email
  // behind them, and a new draft beside an emailed quote is an update too.
  const sendingAnUpdate =
    quoteToSend !== null && (quoteEmailedBefore === true || quotes.some((q) => Boolean(q.lastSentAt)))
  const sendButtonLabel = sendingAnUpdate ? "Preview & Send Updated Quote" : "Preview & Send"
  const noQuoteToSendReason = quotes.some((q) => q.status === "expired")
    ? "Nothing to send: every quote here is expired, cancelled or replaced. Create a new quote to send one."
    : "Nothing to send: every quote here is cancelled or replaced. Create a new quote to send one."
  const canEditBooking =
    can("edit:quotes") && bookingEditIneligibilityReason({ bookingStage, bookingCancelledAt }) === null

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
        <p className="text-sm text-muted-foreground">
          No quotes yet. Create one, add the services, then preview and send it to the client.
        </p>
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {quoteToSend
              ? `Sends ${formatQuoteDisplayLabel(quoteToSend.quoteNumber)} to the client.`
              : noQuoteToSendReason}
          </p>
          <div className="flex flex-wrap gap-2">
            {/* Once a quote is accepted, Edit Booking replaces starting a new quote. */}
            {!quotes.some((q) => q.status === "accepted") && (
              <CreateQuoteDialog
                jobId={jobId}
                onCreated={(quoteId) => {
                  mutate()
                  setAutoOpenBuildBookingQuoteId(quoteId)
                }}
              />
            )}
            <Button
              size="sm"
              // An update is the main action only while the booking has changed since the client
              // was last sent a quote; when it has not, sending again is the quieter choice.
              variant={sendingAnUpdate && quoteChangedSinceSent === false ? "outline" : "default"}
              disabled={!quoteToSend}
              onClick={() => setPreviewSendOpen(true)}
            >
              <Mail className="w-3.5 h-3.5 mr-1.5" />
              {sendButtonLabel}
            </Button>
          </div>
        </div>
      )}
      {quoteToSend && (
        <QuotePreviewSendDialog
          quote={quoteToSend}
          bookingNumber={bookingNumber}
          customerName={customerName}
          emailImportNeedsReview={emailImportNeedsReview}
          sendingAnUpdate={sendingAnUpdate}
          open={previewSendOpen}
          onOpenChange={setPreviewSendOpen}
          onSent={mutate}
        />
      )}
      <AlertDialog
        open={quoteToCancel !== null}
        onOpenChange={(open) => {
          if (!open) setQuoteToCancel(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {quoteToCancel ? `Cancel ${formatQuoteDisplayLabel(quoteToCancel.quoteNumber)}?` : "Cancel quote?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {quoteToCancel?.status === "sent"
                ? "The client has already received this quote and is not told it was cancelled. A cancelled quote cannot be reopened."
                : "A cancelled quote cannot be reopened."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep quote</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = quoteToCancel
                setQuoteToCancel(null)
                if (target) void cancelQuote(target.id)
              }}
            >
              Cancel quote
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Newest first: the quote being worked on is at the top. The API sends oldest first. */}
      {[...quotes].reverse().map(q => {
        const badge = STATUS_BADGE[q.status] || { variant: "outline" as const, label: q.status }
        const hasIncomplete = q.lineItems.some(isMissingPricing)
        const isEditableQuote = EDITABLE_QUOTE_STATUSES.includes(q.status)
        const isDeadQuote = q.status === "cancelled" || q.status === "superseded"
        const hasPricingGap = q.status === "pricing_incomplete" || (!isDeadQuote && hasIncomplete)
        // Only an editor sees the send button the warning points at, and only the quote the client
        // holds gets it (a draft beside it is not what the client has).
        const showsChangedSinceSent =
          quoteChangedSinceSent === true && can("edit:quotes") && currentIssuedQuote?.id === q.id
        const nextStep = describeNextStep({
          status: q.status,
          hasPricingGap,
          isQuoteToSend: quoteToSend?.id === q.id,
          sendButtonLabel,
          canEdit: can("edit:quotes"),
          canEditBooking,
        })
        const sentLine = q.lastSentAt
          ? `Sent to the client ${formatDisplayDateTime(q.lastSentAt)}`
          : isEditableQuote
            ? "Not sent to the client yet"
            : null
        const showsSentLine = !isDeadQuote && sentLine !== null
        const canEditLines = can("edit:quotes") && EDITABLE_QUOTE_STATUSES.includes(q.status)
        // Commission, Rounding, Agent Commission and Discount stay editable once the client has the
        // quote or has accepted it (the server re-derives the balance for an accepted one), unless
        // the booking is closed or cancelled. The service lines above stay a draft-only edit: they
        // change through Edit Booking.
        const canEditAdjustments =
          can("edit:quotes") &&
          (EDITABLE_QUOTE_STATUSES.includes(q.status) ||
            ((q.status === "sent" || q.status === "accepted" || q.status === "expired") &&
              bookingEditIneligibilityReason({ bookingStage, bookingCancelledAt }) === null))

        return (
          <Card key={q.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-sm font-medium" title={q.quoteNumber || undefined}>
                      {formatQuoteDisplayLabel(q.quoteNumber)}
                    </CardTitle>
                    <Badge variant={badge.variant} className={`text-[10px] ${badge.className ?? ""}`}>{badge.label}</Badge>
                    {/* The "Provisional (Incomplete)" badge already says so. */}
                    {hasIncomplete && q.status !== "pricing_incomplete" && (
                      <Badge variant="destructive" className="text-[10px]">Missing pricing</Badge>
                    )}
                  </div>
                  {showsSentLine && <p className="mt-1 text-xs text-muted-foreground">{sentLine}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {QUOTE_VALIDITY_ENABLED && (
                    <span className="text-xs text-muted-foreground">Valid until {formatDisplayDate(q.validityUntil)}</span>
                  )}
                  {can("edit:quotes") && (
                    <>
                      {/* Edit Booking (the amend engine): changes an accepted quote in place — no rewind,
                          no emails. It replaces Revise, which is no longer offered on this tab.
                          See lib/quotes/amend-quote.ts. */}
                      {amendIneligibilityReason({
                        quoteStatus: q.status,
                        bookingStage,
                        bookingCancelledAt,
                      }) === null && (
                        <BuildBookingDialog
                          jobId={jobId}
                          quoteId={q.id}
                          quoteCurrency={q.currency}
                          travelDate={travelDate}
                          existingLineItemCount={q.lineItems.length}
                          existingLineItems={q.lineItems}
                          expectedUpdatedAt={q.updatedAt}
                          onApplied={mutate}
                          amend={{
                            currentTotal: q.total,
                            bookingStage,
                            agentCommission: q.agentCommission ?? 0,
                            discountAmount: q.discountAmount ?? 0,
                          }}
                        />
                      )}
                      {!["cancelled", "superseded", "expired"].includes(q.status) &&
                        (EDITABLE_QUOTE_STATUSES.includes(q.status) ||
                          bookingEditIneligibilityReason({ bookingStage, bookingCancelledAt }) === null) && (
                          <ConvertQuoteCurrencyDialog
                            quoteId={q.id}
                            currency={q.currency}
                            lineItems={q.lineItems}
                            total={q.total}
                            alreadySent={!EDITABLE_QUOTE_STATUSES.includes(q.status)}
                            onConverted={mutate}
                          />
                        )}
                      {BUILDABLE_QUOTE_STATUSES.includes(q.status) &&
                        (EDITABLE_QUOTE_STATUSES.includes(q.status) ||
                          bookingEditIneligibilityReason({ bookingStage, bookingCancelledAt }) === null) && (
                        <BuildBookingDialog
                          editBookingWording={!EDITABLE_QUOTE_STATUSES.includes(q.status)}
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
                        View PDF
                      </Button>
                      {["draft", "pricing_incomplete", "ready", "sent"].includes(q.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={cancellingQuoteId === q.id}
                          onClick={() => setQuoteToCancel(q)}
                        >
                          {cancellingQuoteId === q.id ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <X className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Cancel Quote
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
              {showsChangedSinceSent ? (
                <p
                  role="status"
                  className="mt-2 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-foreground"
                >
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-500" aria-hidden="true" />
                  <span>
                    The booking has changed since this was sent. The client may still have the old version. Use
                    Preview &amp; Send Updated Quote, or save it without sending from the send window.
                  </span>
                </p>
              ) : nextStep ? (
                <p className="mt-2 text-xs text-muted-foreground">{nextStep}</p>
              ) : null}
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] table-fixed text-sm" style={{ fontFamily: "var(--font-inter)" }}>
                  <thead>
                    <tr className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
                      <th className="pb-2 pr-4 w-28">Date</th>
                      <th className="pb-2 w-[34%]">Description</th>
                      <th className="pb-2 pl-4 text-right w-16">Qty</th>
                      <th className="pb-2 pl-6 text-right w-28">Unit Price</th>
                      <th className="pb-2 pl-6 text-right w-28">Total</th>
                      {canEditLines && <th className="pb-2 w-8" aria-label="Actions" />}
                    </tr>
                  </thead>
                  <tbody>
                    {q.lineItems.map((li, i) => {
                      // The Commission line is edited and shown in the pricing ledger below, not
                      // in this table — see components/quotes/quote-adjustments-ledger.tsx.
                      if (i === findCommissionLineIndex(q.lineItems)) return null
                      const isExtra = li.pricingSnapshot?.isExtra === true
                      const isComplimentary = isComplimentaryLine(li)
                      return (
                      <tr key={i} className="border-b border-border/50 last:border-0">
                        <td className="py-2 pr-4 text-xs text-muted-foreground" data-testid="quote-line-date">
                          {describeLineDate(li) ?? "—"}
                        </td>
                        <td className="py-2 text-xs text-foreground break-words">
                          {li.description}
                          {isExtra ? (
                            <Badge variant="outline" className="ml-1.5 text-[9px] align-middle">Extra</Badge>
                          ) : null}
                          {/* Internal only — the client's PDF and email show the converted
                              figure alone. See components/quotes/fx-provenance-note.tsx. */}
                          <FxProvenanceNote snapshot={li.pricingSnapshot ?? null} />
                          {/* Also internal only — see components/quotes/room-override-note.tsx. */}
                          <RoomOverrideNote snapshot={li.pricingSnapshot ?? null} quoteCurrency={q.currency} />
                          <TransportOverrideNote snapshot={li.pricingSnapshot ?? null} quoteCurrency={q.currency} />
                          <TourOverrideNote snapshot={li.pricingSnapshot ?? null} quoteCurrency={q.currency} />
                          <TrainOverrideNote snapshot={li.pricingSnapshot ?? null} quoteCurrency={q.currency} />
                        </td>
                        <td className="py-2 pl-4 text-xs text-right text-muted-foreground">
                          <div>{li.qty}</div>
                          {li.pricingSnapshot?.unit ? (
                            <div className="text-[10px] text-muted-foreground">{li.pricingSnapshot.unit}</div>
                          ) : null}
                          {/* Person-nights read as a headcount beside "per person per night", so
                              the multiplication is spelled out — see describeQtyBasis. */}
                          {describeQtyBasis(li) ? (
                            <div className="text-[10px] text-muted-foreground">{describeQtyBasis(li)}</div>
                          ) : null}
                          {/* qty is the charged nights once a night was gifted — the stay itself
                              is longer, and the client documents still say so. */}
                          {hasComplimentaryNight(li) ? (
                            <div className="text-[10px] text-emerald-600 dark:text-emerald-500">
                              of {stayNights(li)} nights
                            </div>
                          ) : null}
                        </td>
                        <td
                          className={`py-2 pl-6 text-xs text-right ${
                            isMissingPricing(li) ? "text-destructive font-medium" : "text-muted-foreground"
                          }`}
                        >
                          {li.unitPrice === 0 && !isComplimentary && !isDeliberateZeroCommission(li)
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
                              className="-m-2 rounded p-2 text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
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
              <div className="mt-3">
                <QuoteAdjustmentsLedger
                  quote={q}
                  editable={canEditAdjustments}
                  bookingHeadcount={bookingHeadcount}
                  onSaved={mutate}
                />
              </div>
              {q.overrideReason && (
                <div className="mt-3 p-2 bg-payment-yellow/10 rounded-md">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "var(--font-inter)" }}>Pricing Override</p>
                  <p className="text-xs text-foreground mt-0.5">{q.overrideReason}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
