"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { QuoteValidityPicker } from "@/components/ui/quote-validity-picker"
import { QUOTE_VALIDITY_ENABLED } from "@/lib/feature-flags"
import { DEFAULT_QUOTE_VALIDITY_DAYS, isoDateDaysFromNow } from "@/lib/quotes/quote-validity"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useRole } from "@/lib/role-context"
import type { Enquiry, Itinerary, PipelineStage, Traveller } from "@/lib/types"
import type { GateFailure } from "@/lib/pipeline/validate-transition"
import { formatDisplayDate } from "@/lib/date-format"
import { ChevronDown, TriangleAlert } from "lucide-react"
import { EnquiryParsedFieldsEditor } from "@/components/enquiry-parsed-fields-editor"
import { EnquiryReadinessPanel } from "@/components/enquiry-readiness-panel"
import type { EnquiryReadiness } from "@/lib/enquiry/build-readiness"
import { useState } from "react"
import { toast } from "sonner"

interface JobEnquiryTabProps {
  enquiry: Enquiry | null
  itineraries: Itinerary[]
  stage: PipelineStage
  hasDraftQuotes: boolean
  /** Row version of the booking, so an edit here fails loudly instead of overwriting a sibling save. */
  bookingUpdatedAt?: string
  onQuoteStarted?: (quoteId: string) => Promise<void> | void
  onFieldsUpdated?: () => void | Promise<void>
  /** What the booking is actually built as vs what the customer asked for — see
   * lib/enquiry/build-readiness.ts. Null while the booking aggregate is still loading. */
  readiness: EnquiryReadiness | null
  readinessLoading?: boolean
  readinessError?: boolean
  onRetryReadiness?: () => void
  /** The first quote whose services can still be built/rebuilt, if any — see
   * BUILDABLE_QUOTE_STATUSES in job-quotes-tab.tsx. */
  buildBookingQuoteId: string | null
  onOpenBuildBooking?: (quoteId: string) => void
}

export function JobEnquiryTab({
  enquiry,
  itineraries,
  stage,
  hasDraftQuotes,
  bookingUpdatedAt,
  onQuoteStarted,
  onFieldsUpdated,
  readiness,
  readinessLoading = false,
  readinessError = false,
  onRetryReadiness,
  buildBookingQuoteId,
  onOpenBuildBooking,
}: JobEnquiryTabProps) {
  const { can } = useRole()
  const [isStartingQuote, setIsStartingQuote] = useState(false)
  const [isRawTextOpen, setIsRawTextOpen] = useState(false)
  const [startQuoteFailures, setStartQuoteFailures] = useState<GateFailure[]>([])
  const [startQuoteDialogOpen, setStartQuoteDialogOpen] = useState(false)
  const [startQuoteValidityUntil, setStartQuoteValidityUntil] = useState<string>(
    isoDateDaysFromNow(DEFAULT_QUOTE_VALIDITY_DAYS),
  )

  if (!enquiry) {
    return <div className="text-center py-8 text-sm text-muted-foreground">No enquiry data</div>
  }

  const canStartQuote = can("edit:quotes") && stage === "enquiry" && !hasDraftQuotes

  const startQuote = async () => {
    setIsStartingQuote(true)
    setStartQuoteFailures([])
    try {
      const response = await fetch(`/api/jobs/${enquiry.jobId}/start-quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Validity is hidden: the server stamps the silent org default.
        body: JSON.stringify(
          QUOTE_VALIDITY_ENABLED ? { validityUntil: startQuoteValidityUntil } : {},
        ),
      })
      const payload = (await response.json().catch(() => ({}))) as {
        failures?: GateFailure[]
        error?: string
        quote?: { id: string }
      }

      if (response.status === 422 && Array.isArray(payload.failures)) {
        setStartQuoteDialogOpen(false)
        setStartQuoteFailures(payload.failures)
        return
      }

      if (!response.ok || !payload.quote) {
        throw new Error(payload.error ?? "Could not start quote")
      }

      setStartQuoteDialogOpen(false)
      await onQuoteStarted?.(payload.quote.id)
      toast.success("Draft quote created")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start quote")
    } finally {
      setIsStartingQuote(false)
    }
  }

  function handleStartQuoteDialogOpenChange(next: boolean) {
    if (next) {
      setStartQuoteValidityUntil(isoDateDaysFromNow(DEFAULT_QUOTE_VALIDITY_DAYS))
    }
    setStartQuoteDialogOpen(next)
  }

  return (
    <div className="space-y-4">
      {/* Only reachable when QUOTE_VALIDITY_ENABLED — the readiness panel's Start Quote button
          skips it otherwise. */}
      <Dialog open={startQuoteDialogOpen} onOpenChange={handleStartQuoteDialogOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Start Quote</DialogTitle>
            <DialogDescription>
              Choose how long this quote should stay valid, then start drafting it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5 py-2">
            <Label htmlFor="start-quote-validity">Valid until</Label>
            <QuoteValidityPicker
              id="start-quote-validity"
              value={startQuoteValidityUntil}
              onChange={value => setStartQuoteValidityUntil(value ?? "")}
            />
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setStartQuoteDialogOpen(false)}
              disabled={isStartingQuote}
            >
              Cancel
            </Button>
            <Button onClick={startQuote} disabled={isStartingQuote}>
              {isStartingQuote ? "Starting…" : "Start Quote"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {startQuoteFailures.length > 0 && (
        <Alert>
          <AlertTitle>Quote cannot start yet</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {startQuoteFailures.map((failure) => (
                <li key={failure.gateId}>
                  {failure.message} {failure.fixHint ? <span>{failure.fixHint}</span> : null}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <EnquiryReadinessPanel
        readiness={readiness}
        isLoading={readinessLoading}
        error={readinessError}
        onRetry={onRetryReadiness ?? (() => undefined)}
        onOpenBuildBooking={buildBookingQuoteId ? onOpenBuildBooking ?? null : null}
        buildBookingQuoteId={buildBookingQuoteId}
        onStartQuote={canStartQuote ? () => (QUOTE_VALIDITY_ENABLED ? handleStartQuoteDialogOpenChange(true) : startQuote()) : null}
        isStartingQuote={isStartingQuote}
      />

      {/* Needs-review detail now lives in the readiness panel's blockers, on every source — this
          card is metadata only. */}
      {enquiry.source === "email" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              Email Source <Badge variant="secondary" className="text-[10px]">inbound</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Mailbox" value={enquiry.emailImportMailbox ?? "-"} />
              <Field label="Subject" value={enquiry.emailImportSubject ?? "-"} />
              <Field label="Received" value={enquiry.emailImportReceivedAtDisplay ?? "-"} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Raw text if paste or email import */}
      {enquiry.rawText && (
        <Card>
          <Collapsible open={isRawTextOpen} onOpenChange={setIsRawTextOpen}>
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-2 cursor-pointer select-none">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isRawTextOpen ? "" : "-rotate-90"}`} />
                  Original Text <Badge variant="secondary" className="text-[10px]">{enquiry.source === "email" ? "email import" : "paste import"}</Badge>
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap bg-secondary/50 rounded-md p-3 leading-relaxed" style={{ fontFamily: "var(--font-inter)" }}>
                  {enquiry.rawText}
                </pre>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}

      <CustomerContactCard enquiry={enquiry} />

      {/* Journey Details — editable at any stage; customer requests can change after the quote goes out */}
      <EnquiryParsedFieldsEditor
        bookingId={enquiry.jobId}
        expectedUpdatedAt={bookingUpdatedAt}
        fields={{
          noOfAdults: enquiry.noOfAdults,
          noOfChildren: enquiry.noOfChildren,
          childAges: enquiry.childAges ?? [],
          noOfSuites: enquiry.noOfSuites,
          departureDate: enquiry.departureDate ?? null,
          direction: enquiry.direction ?? null,
        }}
        directionResolved={enquiry.directionResolved}
        originalNoOfAdults={enquiry.noOfAdultsOriginal}
        originalNoOfChildren={enquiry.noOfChildrenOriginal}
        onSaved={onFieldsUpdated}
      />
      {/* Purpose and Suite Types are not editable — shown separately */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Trip Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Purpose" value={enquiry.purpose} />
            {enquiry.supplier && (
              <Field label="Supplier" value={enquiry.supplier} unresolved={!enquiry.supplierResolved} />
            )}
            <Field label="Suite Types" value={enquiry.suiteTypes.join(", ")} />
            {enquiry.childAges && enquiry.childAges.length > 0 && (
              <Field label="Child Ages" value={enquiry.childAges.join(", ")} />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Hotel & Extras */}
      {(enquiry.hotelBooking || enquiry.hotelOption || enquiry.packageOption || enquiry.additionalServices) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Hotel & Additional Services</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {enquiry.packageOption && <Field label="Package" value={enquiry.packageOption} />}
              {enquiry.hotelBooking && <Field label="Hotel Booking" value={enquiry.hotelBooking} />}
              {enquiry.hotelOption && (
                <Field label="Hotel" value={enquiry.hotelOption} unresolved={!enquiry.hotelOptionResolved} />
              )}
              {enquiry.hotelPhase && (
                <Field label="Hotel Timing" value={enquiry.hotelPhase === "pre" ? "Pre-departure" : "Post-departure"} />
              )}
              {enquiry.extendStay && <Field label="Extend Stay" value={enquiry.extendStay} />}
              {enquiry.extraNights !== undefined && enquiry.extraNights > 0 && <Field label="Extra Nights" value={String(enquiry.extraNights)} />}
              {enquiry.additionalServices && <Field label="Additional Services" value={enquiry.additionalServices} />}
              {enquiry.additionalServicesDetails && <Field label="Service Details" value={enquiry.additionalServicesDetails} />}
              {enquiry.promotionCode && <Field label="Promo Code" value={enquiry.promotionCode} />}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Travellers */}
      {enquiry.travellers && enquiry.travellers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Adult Travellers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {enquiry.travellers.map((t, i) => (
                <TravellerRow key={i} traveller={t} index={i + 1} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {enquiry.childTravellers && enquiry.childTravellers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Child Travellers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {enquiry.childTravellers.map((t, i) => (
                <TravellerRow key={i} traveller={t} index={i + 1} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Itineraries */}
      {itineraries.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Itineraries</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {itineraries.map(it => (
              <div key={it.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium text-foreground">{it.name}</p>
                  <p className="text-xs text-muted-foreground">{it.notes}</p>
                </div>
                {it.acceptedAt && <Badge className="text-[10px] bg-payment-green/10 text-payment-green border-0">Accepted</Badge>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/**
 * Contact fields the `customer_complete` gate in lib/pipeline/validate-transition.ts requires
 * before a booking may leave enquiry. Kept in the same order and with the same "blank counts as
 * missing" rule so the tab and the gate can't disagree about what is outstanding.
 */
const CUSTOMER_CONTACT_FIELDS: readonly { label: string; read: (enquiry: Enquiry) => string | undefined }[] = [
  { label: "First Name", read: (e) => e.name },
  { label: "Surname", read: (e) => e.surname },
  { label: "Email", read: (e) => e.email },
  { label: "Phone", read: (e) => e.contactNumber },
  { label: "Country", read: (e) => e.country },
]

function CustomerContactCard({ enquiry }: { enquiry: Enquiry }) {
  const fields = CUSTOMER_CONTACT_FIELDS.map(({ label, read }) => {
    const value = read(enquiry)?.trim() ?? ""
    return { label, value, missing: value.length === 0 }
  })
  const missingLabels = fields.filter((field) => field.missing).map((field) => field.label.toLowerCase())

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Customer Contact</CardTitle>
      </CardHeader>
      <CardContent>
        {missingLabels.length > 0 && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            <TriangleAlert className="mt-0.5 w-4 h-4 shrink-0" aria-hidden="true" />
            <p>
              Missing {missingLabels.join(", ")}. This booking cannot move past enquiry until the
              customer record is complete — open the customer to fill it in.
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {fields.map(({ label, value, missing }) => (
            <Field key={label} label={label} value={value} missing={missing} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function Field({
  label,
  value,
  unresolved,
  missing,
}: {
  label: string
  value: string
  /** When true, `value` is the customer's raw wording that couldn't be matched to a database
   * record (route, supplier, hotel) -- shown with a warning icon rather than as a plain value,
   * per CLAUDE.md's "never rely on color alone to convey state". */
  unresolved?: boolean
  /** When true the value is absent and a stage gate depends on it -- labelled in words, not by
   * colour alone, so it reads the same to a screen reader and in a high-contrast theme. */
  missing?: boolean
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "var(--font-inter)" }}>{label}</p>
      <p className="text-sm text-foreground mt-0.5 flex items-center gap-1.5">
        {missing ? (
          <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-500">
            <TriangleAlert className="w-3.5 h-3.5" aria-hidden="true" />
            Not provided
          </span>
        ) : (
          value
        )}
        {unresolved && (
          <span
            className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500"
            title="Not matched to a database record -- shown as the customer wrote it"
          >
            <TriangleAlert className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="sr-only">Unresolved</span>
          </span>
        )}
      </p>
    </div>
  )
}

function TravellerRow({ traveller, index }: { traveller: Traveller; index: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2 border-b border-border last:border-0">
      <Field label={`Traveller ${index}`} value={`${traveller.prefix} ${traveller.name} ${traveller.surname}`} />
      <Field label="ID/Passport" value={traveller.idPassport} />
      <Field label="Date of Birth" value={formatDisplayDate(traveller.dateOfBirth)} />
    </div>
  )
}
