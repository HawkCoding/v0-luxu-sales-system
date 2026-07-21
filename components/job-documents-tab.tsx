"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { DocRecord, Enquiry, Job, Customer, Itinerary } from "@/lib/types"
import { AlertCircle, FileText } from "lucide-react"
import { GenerateVoucherDialog } from "@/components/generate-voucher-dialog"
import { GenerateItineraryDialog } from "@/components/generate-itinerary-dialog"
import { formatDisplayDateTime } from "@/lib/date-format"

const CONFIRMED_STAGES = new Set(["deposit_paid", "final_paid", "voucher_sent", "closed"])
const VOUCHER_STAGES = new Set(["final_paid", "voucher_sent", "closed"])

interface JobDocumentsTabProps {
  documents: DocRecord[]
  job?: Job
  enquiry?: Enquiry
  customer?: Customer
  itineraries?: Itinerary[]
  onChange?: () => Promise<void> | void
  loading?: boolean
  error?: Error | null
}

export function JobDocumentsTab({
  documents,
  job,
  enquiry,
  customer,
  itineraries = [],
  onChange,
  loading = false,
  error = null,
}: JobDocumentsTabProps) {
  const canGenerateVoucher = job && enquiry && customer && VOUCHER_STAGES.has(job.stage ?? "")
  const canGenerateItinerary = job && customer && CONFIRMED_STAGES.has(job.stage ?? "")
  const existingItinerary = itineraries[0] ?? null
  const hasItinerary = documents.some((d) => d.kind === "itinerary_pdf")

  // Pre-fill a sensible trip title from the booking's route + customer surname —
  // still just a starting point, the salesperson can always edit it before generating.
  const defaultItineraryTitle = (() => {
    const route = enquiry?.direction?.trim()
    const lastName = customer?.lastName?.trim()
    if (route && lastName) return `${route} — ${lastName} Family`
    if (lastName) return `${lastName} Family`
    return ""
  })()
  const initialItineraryTitle = existingItinerary?.name ?? defaultItineraryTitle

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full">
                <Skeleton className="w-8 h-8 rounded-md" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
              </div>
              <Skeleton className="h-5 w-12" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="w-4 h-4" />
        <AlertTitle>Could not load documents</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>{error.message || "Something went wrong while loading documents."}</p>
          {onChange ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void onChange()
              }}
            >
              Retry
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-3">
      {canGenerateItinerary && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Generate Client Itinerary</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Create a personalised trip overview PDF to send to the client
                </p>
              </div>
              <GenerateItineraryDialog
                jobId={job.id}
                bookingNumber={job.jobNumber}
                initialTripTitle={initialItineraryTitle}
                initialTripNotes={existingItinerary?.notes ?? ""}
                onGenerated={onChange}
                onSent={onChange}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {canGenerateVoucher && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Generate Travel Voucher</p>
                <p className="text-xs text-muted-foreground mt-0.5">Create, preview, and send the PDF voucher</p>
              </div>
              <GenerateVoucherDialog
                jobId={job.id}
                bookingNumber={job.jobNumber}
                onGenerated={onChange}
                hasItinerary={hasItinerary}
                initialItineraryTitle={initialItineraryTitle}
                initialItineraryNotes={existingItinerary?.notes ?? ""}
                onItineraryGenerated={onChange}
                onSent={async () => {
                  await onChange?.()
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {documents.length === 0 && !canGenerateVoucher && !canGenerateItinerary && (
        <div className="text-center py-8 text-sm text-muted-foreground">No documents generated</div>
      )}

      {documents.map((d) => (
        <Card key={d.id}>
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
                <FileText className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {d.kind.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Generated: {formatDisplayDateTime(d.generatedAt)}
                </p>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px]">
              PDF
            </Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
