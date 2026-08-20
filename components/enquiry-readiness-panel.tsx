"use client"

import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDisplayDateTime } from "@/lib/date-format"
import { describeReviewReasons, REVIEW_REASON } from "@/lib/inbound-email/review-reasons"
import type { EnquiryReadiness, ReadinessNote, NeedsReviewBlocker } from "@/lib/enquiry/build-readiness"
import Link from "next/link"

interface EnquiryReadinessPanelProps {
  readiness: EnquiryReadiness | null
  isLoading: boolean
  error: boolean
  onRetry: () => void
  /** Non-null when there is a quote whose services can still be built/rebuilt. */
  onOpenBuildBooking: ((quoteId: string) => void) | null
  buildBookingQuoteId: string | null
  /** Falls back to Start Quote when no buildable quote exists yet. */
  onStartQuote: (() => void) | null
  isStartingQuote: boolean
}

function isNeedsReviewBlocker(note: ReadinessNote): note is NeedsReviewBlocker {
  return note.id === "needs_review"
}

function StateBadge({ state }: { state: EnquiryReadiness["state"] }) {
  if (state === "not_built") return <Badge variant="destructive">Not built yet</Badge>
  if (state === "confirmed") return <Badge variant="secondary">Confirmed</Badge>
  return (
    <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-500">
      Auto-filled — needs review
    </Badge>
  )
}

function NoteRow({ note }: { note: ReadinessNote }) {
  const Icon = note.severity === "block" ? AlertCircle : note.severity === "warn" ? TriangleAlert : Info
  const color =
    note.severity === "block"
      ? "text-destructive"
      : note.severity === "warn"
        ? "text-amber-600 dark:text-amber-500"
        : "text-muted-foreground"

  return (
    <li className="flex gap-2 text-sm">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
      <div>
        <p className="font-medium">{note.title}</p>
        {note.detail && <p className="text-muted-foreground">{note.detail}</p>}
      </div>
    </li>
  )
}

/** Renders exactly what the old email-only "Needs Review" banner rendered, now available on every
 * source instead of being hidden inside the email-import metadata card. */
function NeedsReviewRow({ blocker }: { blocker: NeedsReviewBlocker }) {
  const reasons = describeReviewReasons(blocker.missingFields, blocker.warnings)
  return (
    <li className="flex gap-2 text-sm">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div>
        <p className="font-medium">{blocker.title}</p>
        <ul className="mt-1.5 space-y-1">
          {reasons.map((reason) => (
            <li key={reason.reason}>
              <span className="font-medium">{reason.label}</span>{" "}
              <span className="text-muted-foreground">{reason.fixHint}</span>
              {reason.reason === REVIEW_REASON.possibleDuplicate && blocker.duplicateOfBookingId && (
                <>
                  {" "}
                  <Link
                    href={`/app/bookings/${blocker.duplicateOfBookingId}`}
                    className="underline underline-offset-2 hover:text-primary"
                  >
                    View possible duplicate
                  </Link>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </li>
  )
}

export function EnquiryReadinessPanel({
  readiness,
  isLoading,
  error,
  onRetry,
  onOpenBuildBooking,
  buildBookingQuoteId,
  onStartQuote,
  isStartingQuote,
}: EnquiryReadinessPanelProps) {
  if (isLoading || !readiness) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Requested services</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-5/6" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Requested services</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Could not load the booking's services.</p>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  const bodyCopy =
    readiness.state === "not_built"
      ? "Nothing has been built for this booking yet. The quote cannot be priced until at least the train journey exists."
      : readiness.state === "auto_built"
        ? "These services were filled in automatically from the enquiry. Open Build Booking to check the dates, suites and rates, then confirm."
        : `Services confirmed by ${readiness.servicesConfirmedByName ?? "a consultant"}${
            readiness.servicesConfirmedAt ? ` on ${formatDisplayDateTime(readiness.servicesConfirmedAt)}` : ""
          }.`

  const actionLabel =
    readiness.state === "not_built" ? "Build booking" : readiness.state === "auto_built" ? "Review services" : "Open Build Booking"

  const action =
    buildBookingQuoteId && onOpenBuildBooking ? (
      <Button type="button" size="sm" onClick={() => onOpenBuildBooking(buildBookingQuoteId)}>
        {actionLabel}
      </Button>
    ) : onStartQuote ? (
      <Button type="button" size="sm" onClick={onStartQuote} disabled={isStartingQuote}>
        {isStartingQuote ? "Starting…" : "Start Quote"}
      </Button>
    ) : null

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium">Requested services</CardTitle>
            <StateBadge state={readiness.state} />
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{bodyCopy}</p>
        {readiness.autoBuildSkipReason && (
          <p className="text-sm text-muted-foreground">At intake: {readiness.autoBuildSkipReason}</p>
        )}
        {!buildBookingQuoteId && !onStartQuote && readiness.state === "not_built" && (
          <p className="text-sm text-muted-foreground">A quote has to exist before services can be configured.</p>
        )}

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Booked as</p>
          {readiness.services.length === 0 ? (
            <p className="text-sm text-muted-foreground">No services built yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {readiness.services.map((service) => (
                <div key={service.serviceId} className="rounded-md border bg-secondary/20 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">
                      {service.kindLabel} · {service.supplierName ?? "No supplier"}
                    </p>
                    {service.origin === "auto" && <Badge variant="secondary">Auto-filled</Badge>}
                    {!service.selected && <Badge variant="outline">Not included in quote</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {service.serviceDateDisplay ?? "No date set"}
                    {service.nights ? `, ${service.nights} night${service.nights === 1 ? "" : "s"}` : ""}
                    {" · "}
                    {service.unitCount} suite{service.unitCount === 1 ? "" : "s"}/room{service.unitCount === 1 ? "" : "s"}
                  </p>
                  {service.issues.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {service.issues.map((issue) => (
                        <li key={issue} className="text-sm text-amber-600 dark:text-amber-500">
                          {issue}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Asked for, not built
          </p>
          {readiness.gaps.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" />
              Everything the customer asked for is reflected in the services above.
            </p>
          ) : (
            <ul className="space-y-2">
              {readiness.gaps.map((gap) => (
                <NoteRow key={gap.id} note={gap} />
              ))}
            </ul>
          )}
        </div>

        {readiness.blockers.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Before the quote can go out
            </p>
            <ul className="space-y-2">
              {readiness.blockers.map((blocker) =>
                isNeedsReviewBlocker(blocker) ? (
                  <NeedsReviewRow key={blocker.id} blocker={blocker} />
                ) : (
                  <NoteRow key={blocker.id} note={blocker} />
                ),
              )}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
