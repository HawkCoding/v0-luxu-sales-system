"use client"

import { useJobDetail } from "@/lib/use-data"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ContentTransition } from "@/components/ui/content-transition"
import { Skeleton } from "@/components/ui/skeleton"
import {
  CONSULTANTS,
  getCanonicalPipelineStage,
  getPipelineStageLabel,
  PIPELINE_STAGES,
  type PipelineStage,
} from "@/lib/types"
import { useRole } from "@/lib/role-context"
import { AlertCircle, ArrowLeft, CheckCircle2, ChevronRight, ChevronLeft as ChevronLeftIcon, UserRound, XCircle } from "lucide-react"
import Link from "next/link"
import { JobEnquiryTab } from "@/components/job-enquiry-tab"
import { JobQuotesTab } from "@/components/job-quotes-tab"
import { JobPaymentsTab } from "@/components/job-payments-tab"
import { JobCorrespondenceTab } from "@/components/job-correspondence-tab"
import { JobDocumentsTab } from "@/components/job-documents-tab"
import { JobAuditTab } from "@/components/job-audit-tab"
import { CancelBookingDialog } from "@/components/cancel-booking-dialog"
import { PresenceAvatars } from "@/components/presence-avatars"
import { useRecordPresence } from "@/hooks/use-record-presence"
import { useVersionedSave } from "@/hooks/use-versioned-save"
import { toast } from "sonner"

interface JobPatchResponse {
  id: string
  updatedAt: string
}

function JobDetailSkeleton() {
  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-md" />
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <Skeleton className="h-4 w-56" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-20" />
        </div>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-7 w-24 rounded-md" />
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex gap-2 overflow-hidden rounded-md bg-secondary/50 p-1">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-24 rounded-sm" />
          ))}
        </div>
        <Card>
          <CardHeader className="pb-4">
            <CardTitle>Loading details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-40 w-full rounded-lg" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function JobDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const { data, isLoading, error, mutate } = useJobDetail(id)
  const { can } = useRole()
  const { others, setEditing } = useRecordPresence("job", id)
  const hasLoadError = Boolean(error)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [changeCustomerOpen, setChangeCustomerOpen] = useState(false)
  const [customerSearch, setCustomerSearch] = useState("")
  const [customerResults, setCustomerResults] = useState<Array<{ id: string; firstName: string; lastName: string; email: string }>>([])
  const [changingCustomer, setChangingCustomer] = useState(false)
  const [lastJobPayload, setLastJobPayload] = useState<Record<string, unknown> | null>(null)
  const {
    save: saveJob,
    isSaving: isSavingJob,
    conflict: jobConflict,
    clearConflict: clearJobConflict,
  } = useVersionedSave<Record<string, unknown>, JobPatchResponse>({
    url: `/api/jobs/${id}`,
    method: "PATCH",
    entity: "job",
    recordId: id,
    expectedUpdatedAt: data?.job?.updatedAt,
  })

  useEffect(() => {
    if (!hasLoadError) {
      return
    }
    router.replace("/app/bookings")
  }, [hasLoadError, router])

  useEffect(() => {
    setEditing(cancelOpen || changeCustomerOpen)
  }, [cancelOpen, changeCustomerOpen, setEditing])

  if (isLoading || !data || hasLoadError) {
    return <JobDetailSkeleton />
  }

  const { job, customer, enquiry, itineraries, quotes, payments, documents, correspondence, auditLogs } = data
  const currentStage = getCanonicalPipelineStage(job.stage as PipelineStage)
  const currentStageIdx = PIPELINE_STAGES.findIndex(s => s.key === currentStage)
  const consultantName = CONSULTANTS.find((consultant) => consultant.key === job.consultant)?.name ?? job.consultant ?? undefined
  const needsEmailReview = Boolean(enquiry?.emailImportNeedsReview)

  const saveJobPatch = async (
    payload: Record<string, unknown>,
    options?: { ignoreExpectedUpdatedAt?: boolean },
  ): Promise<boolean> => {
    setLastJobPayload(payload)
    try {
      await saveJob(payload, options)
      await mutate()
      clearJobConflict()
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save booking"
      toast.error(message)
      return false
    }
  }

  const moveStage = async (direction: "forward" | "back") => {
    if (needsEmailReview && direction === "forward") return
    const newIdx = direction === "forward" ? currentStageIdx + 1 : currentStageIdx - 1
    if (newIdx < 0 || newIdx >= PIPELINE_STAGES.length) return
    await saveJobPatch({ stage: PIPELINE_STAGES[newIdx].key })
  }

  const resolveEmailReview = async () => {
    await saveJobPatch({ resolveEmailImportReview: true })
  }

  const searchCustomers = async () => {
    const response = await fetch(`/api/customers?search=${encodeURIComponent(customerSearch)}`)
    if (!response.ok) return

    const body = (await response.json()) as {
      customers: Array<{ id: string; firstName: string; lastName: string; email: string }>
    }
    setCustomerResults(body.customers)
  }

  const changeCustomer = async (customerId: string) => {
    setChangingCustomer(true)
    try {
      const saved = await saveJobPatch({ customerId })
      if (saved) {
        setChangeCustomerOpen(false)
      }
    } finally {
      setChangingCustomer(false)
    }
  }

  return (
    <ContentTransition show>
      <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/app/bookings">
            <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-foreground tracking-tight" style={{ fontFamily: "var(--font-inter)" }}>{job.jobNumber}</h1>
              <Badge variant="outline" className="text-xs">{getPipelineStageLabel(job.stage)}</Badge>
              <Badge variant="secondary" className="text-xs">{job.purpose}</Badge>
              {needsEmailReview && <Badge variant="destructive" className="text-xs">Needs Review</Badge>}
              <PresenceAvatars users={others} className="ml-1" />
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {customer?.firstName} {customer?.lastName} &middot; {customer?.email}
            </p>
          </div>
        </div>
        {can("edit:pipeline") && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={currentStageIdx <= 0} onClick={() => moveStage("back")}>
              <ChevronLeftIcon className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button size="sm" disabled={currentStageIdx >= PIPELINE_STAGES.length - 1 || needsEmailReview || isSavingJob} onClick={() => moveStage("forward")}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
            {can("cancel:booking") && job.stage !== "lost" && job.stage !== "closed" && (
              <Button variant="destructive" size="sm" onClick={() => setCancelOpen(true)}>
                <XCircle className="w-4 h-4 mr-1" /> Cancel Booking
              </Button>
            )}
          </div>
        )}
      </div>

      {jobConflict && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>This booking changed elsewhere</AlertTitle>
          <AlertDescription>
            <p>{jobConflict.error}</p>
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  clearJobConflict()
                  void mutate()
                }}
              >
                Refresh
              </Button>
              {lastJobPayload && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    void saveJobPatch(lastJobPayload, { ignoreExpectedUpdatedAt: true })
                  }}
                  disabled={isSavingJob}
                >
                  Save anyway
                </Button>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Stage Progress */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {PIPELINE_STAGES.map((s, i) => (
          <div
            key={s.key}
            className={`px-2.5 py-1 rounded text-[10px] font-medium whitespace-nowrap transition-colors ${
              i === currentStageIdx
                ? "bg-brand-gold text-card"
                : i < currentStageIdx
                  ? "bg-secondary text-foreground"
                  : "bg-secondary/50 text-muted-foreground"
            }`}
            style={{ fontFamily: "var(--font-inter)" }}
          >
            {s.label}
          </div>
        ))}
      </div>

      {/* Customer Info */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <InfoItem label="Customer" value={`${customer?.firstName} ${customer?.lastName}`} />
            <InfoItem label="Email" value={customer?.email} />
            <InfoItem label="Phone" value={customer?.phone} />
            <InfoItem label="Country" value={customer?.country} />
          </div>
          {enquiry?.source === "email" && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setChangeCustomerOpen(true)}>
                <UserRound className="w-4 h-4 mr-1.5" />
                Change customer
              </Button>
              {needsEmailReview && (
                <Button size="sm" onClick={resolveEmailReview} disabled={isSavingJob}>
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  Resolve review
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {needsEmailReview && (
        <Card className="border-destructive/40">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Email import needs review</p>
                <p className="text-sm text-muted-foreground">
                  {[...(enquiry?.emailImportMissingFields ?? []), ...(enquiry?.emailImportWarnings ?? [])].join(", ") || "Review parsed fields before moving this enquiry forward."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="enquiry" className="space-y-4">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="enquiry" className="text-xs">Enquiry</TabsTrigger>
          <TabsTrigger value="quotes" className="text-xs">Quotes ({quotes.length})</TabsTrigger>
          <TabsTrigger value="payments" className="text-xs">Payments ({payments.length})</TabsTrigger>
          <TabsTrigger value="correspondence" className="text-xs">Emails Sent ({correspondence.length})</TabsTrigger>
          <TabsTrigger value="documents" className="text-xs">Documents ({documents.length})</TabsTrigger>
          <TabsTrigger value="audit" className="text-xs">Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="enquiry">
          <JobEnquiryTab enquiry={enquiry} itineraries={itineraries} onTransportRequestsChange={mutate} />
        </TabsContent>
        <TabsContent value="quotes">
          <JobQuotesTab quotes={quotes} jobId={id} itineraries={itineraries} travelDate={enquiry?.departureDate ?? null} mutate={mutate} />
        </TabsContent>
        <TabsContent value="payments">
          <JobPaymentsTab payments={payments} jobId={id} mutate={mutate} />
        </TabsContent>
        <TabsContent value="correspondence">
          <JobCorrespondenceTab correspondence={correspondence} jobId={id} mutate={mutate} />
        </TabsContent>
        <TabsContent value="documents">
          <JobDocumentsTab documents={documents} job={job} enquiry={enquiry} customer={customer} />
        </TabsContent>
        <TabsContent value="audit">
          <JobAuditTab
            auditLogs={auditLogs}
            context={{
              entities: {
                [job.id]: {
                  label: [job.jobNumber, `${customer?.firstName ?? ""} ${customer?.lastName ?? ""}`.trim()]
                    .filter(Boolean)
                    .join(" - "),
                  actorLabel: consultantName,
                },
              },
            }}
          />
        </TabsContent>
      </Tabs>
      </div>

      <CancelBookingDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        bookingId={id}
        bookingNumber={job.jobNumber}
        sourceStage={job.stage}
        onCancelled={() => router.push("/app/pipeline")}
      />

      <Dialog open={changeCustomerOpen} onOpenChange={setChangeCustomerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change customer</DialogTitle>
            <DialogDescription>
              Assign this booking to an existing customer. The imported customer record is left untouched.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="customer-search">Search customers</Label>
              <div className="flex gap-2">
                <Input
                  id="customer-search"
                  value={customerSearch}
                  onChange={(event) => setCustomerSearch(event.target.value)}
                  placeholder="Name, email, or phone"
                />
                <Button type="button" onClick={searchCustomers}>Search</Button>
              </div>
            </div>
            <div className="space-y-2">
              {customerResults.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  disabled={changingCustomer || isSavingJob}
                  onClick={() => changeCustomer(result.id)}
                  className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="font-medium">{result.firstName} {result.lastName}</span>
                  <span className="block text-xs text-muted-foreground">{result.email}</span>
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </ContentTransition>
  )
}

function InfoItem({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "var(--font-inter)" }}>{label}</p>
      <p className="text-sm text-foreground mt-0.5">{value || "-"}</p>
    </div>
  )
}
