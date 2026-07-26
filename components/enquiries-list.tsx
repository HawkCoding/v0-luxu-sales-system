"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { FileText, Clipboard, Send, AlertCircle } from "lucide-react"
import Link from "next/link"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDisplayDate } from "@/lib/date-format"
import { SUITE_TYPE_MISSING_FIELD } from "@/lib/suites/missing-fields"
import type { EnquiryListItem } from "@/lib/use-data"

interface EnquiriesListProps {
  enquiries: EnquiryListItem[]
  isLoading: boolean
  error?: Error | null
  onSendQuote?: (id: string) => void
  activeFilter?: string
}

function LoadingState() {
  return (
    <div data-testid="enquiries-loading" className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-lg" />
      ))}
    </div>
  )
}

function ErrorState({ error }: { error: Error }) {
  return (
    <Alert variant="destructive" data-testid="enquiries-error">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>Failed to load enquiries: {error.message}</AlertDescription>
    </Alert>
  )
}

function EmptyState({ activeFilter }: { activeFilter?: string }) {
  return (
    <Card className="border-dashed" data-testid="enquiries-empty">
      <CardContent className="p-12">
        <div className="text-center space-y-2">
          <FileText className="w-12 h-12 text-muted-foreground/40 mx-auto" />
          <p className="text-base font-medium text-foreground">No enquiries in queue</p>
          <p className="text-sm text-muted-foreground">
            {activeFilter
              ? "No enquiries match this filter"
              : "All enquiries have been processed or there are no new enquiries yet"}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

export function EnquiriesList({ enquiries, isLoading, error, onSendQuote, activeFilter }: EnquiriesListProps) {
  if (isLoading) return <LoadingState />
  if (error) return <ErrorState error={error} />
  if (enquiries.length === 0) return <EmptyState activeFilter={activeFilter} />

  return (
    <div data-testid="enquiries-list" className="space-y-3">
      {enquiries.map((e) => {
        const customer = e.customer
        const name = customer?.firstName ?? ""
        const surname = customer?.lastName ?? ""
        const email = customer?.email ?? ""
        const title = customer?.title ?? ""

        return (
          <Card key={e.id} className="hover:shadow-md transition-shadow border-2">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    {e.source === "paste_import" ? (
                      <Clipboard className="w-5 h-5 text-primary" />
                    ) : (
                      <FileText className="w-5 h-5 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Link
                        href={`/app/bookings/${e.id}`}
                        className="text-base font-semibold text-foreground hover:text-primary transition-colors"
                      >
                        {e.bookingNumber}
                      </Link>
                      {e.consultant && (
                        <Badge variant="default" className="text-xs font-bold">
                          {e.consultant}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {e.source.replace("_", " ")}
                      </Badge>
                      {e.emailImportNeedsReview && (
                        <Badge variant="destructive" className="text-xs">
                          Needs Review
                        </Badge>
                      )}
                      {e.emailImportDuplicateOfBookingId && (
                        <Badge variant="outline" className="text-xs">
                          Possible duplicate
                        </Badge>
                      )}
                      {(e.emailImportMissingFields || []).includes(SUITE_TYPE_MISSING_FIELD) && (
                        <Badge
                          variant="outline"
                          className="text-xs border-yellow-600 text-yellow-700"
                          title="The suite could not be identified from the enquiry wording — choose one before quoting"
                        >
                          Suite not identified
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {title} {name} {surname} • {email}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{e.direction}</span>
                      <span>•</span>
                      <span>{formatDisplayDate(e.departureDate)}</span>
                      <span>•</span>
                      <span>
                        {e.noOfAdults} adults, {e.noOfChildren} children
                      </span>
                    </div>
                    {e.emailImportNeedsReview && (
                      <Alert className="mt-3 py-2 border-destructive/40">
                        <AlertCircle className="h-3 w-3" />
                        <AlertDescription className="text-xs">
                          Needs Review:{" "}
                          {[...(e.emailImportMissingFields || []), ...(e.emailImportWarnings || [])].join(", ") ||
                            "Review parsed email fields"}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <Button size="sm" onClick={() => onSendQuote?.(e.id)}>
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    Send Quote
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
