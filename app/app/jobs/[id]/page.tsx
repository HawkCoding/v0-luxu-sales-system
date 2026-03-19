"use client"

import { useJobDetail } from "@/lib/use-data"
import { useParams, useRouter } from "next/navigation"
import { useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ContentTransition } from "@/components/ui/content-transition"
import { Skeleton } from "@/components/ui/skeleton"
import { PIPELINE_STAGES, type PipelineStage } from "@/lib/types"
import { useRole } from "@/lib/role-context"
import { ArrowLeft, ChevronRight, ChevronLeft as ChevronLeftIcon } from "lucide-react"
import Link from "next/link"
import { JobEnquiryTab } from "@/components/job-enquiry-tab"
import { JobQuotesTab } from "@/components/job-quotes-tab"
import { JobPaymentsTab } from "@/components/job-payments-tab"
import { JobCorrespondenceTab } from "@/components/job-correspondence-tab"
import { JobDocumentsTab } from "@/components/job-documents-tab"
import { JobAuditTab } from "@/components/job-audit-tab"

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
  const hasLoadError = Boolean(error)

  useEffect(() => {
    if (!hasLoadError) {
      return
    }
    router.replace("/app/bookings")
  }, [hasLoadError, router])

  if (isLoading || !data || hasLoadError) {
    return <JobDetailSkeleton />
  }

  const { job, customer, enquiry, itineraries, quotes, payments, documents, correspondence, auditLogs } = data
  const currentStageIdx = PIPELINE_STAGES.findIndex(s => s.key === job.stage)

  const moveStage = async (direction: "forward" | "back") => {
    const newIdx = direction === "forward" ? currentStageIdx + 1 : currentStageIdx - 1
    if (newIdx < 0 || newIdx >= PIPELINE_STAGES.length) return
    await fetch(`/api/jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: PIPELINE_STAGES[newIdx].key }),
    })
    mutate()
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
              <Badge variant="outline" className="text-xs">{job.stage.replace(/_/g, " ")}</Badge>
              <Badge variant="secondary" className="text-xs">{job.purpose}</Badge>
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
            <Button size="sm" disabled={currentStageIdx >= PIPELINE_STAGES.length - 1} onClick={() => moveStage("forward")}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}
      </div>

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
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="enquiry" className="space-y-4">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="enquiry" className="text-xs">Enquiry</TabsTrigger>
          <TabsTrigger value="quotes" className="text-xs">Quotes ({quotes.length})</TabsTrigger>
          <TabsTrigger value="payments" className="text-xs">Payments ({payments.length})</TabsTrigger>
          <TabsTrigger value="correspondence" className="text-xs">Correspondence ({correspondence.length})</TabsTrigger>
          <TabsTrigger value="documents" className="text-xs">Documents ({documents.length})</TabsTrigger>
          <TabsTrigger value="audit" className="text-xs">Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="enquiry">
          <JobEnquiryTab enquiry={enquiry} itineraries={itineraries} />
        </TabsContent>
        <TabsContent value="quotes">
          <JobQuotesTab quotes={quotes} jobId={id} itineraries={itineraries} mutate={mutate} />
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
          <JobAuditTab auditLogs={auditLogs} />
        </TabsContent>
      </Tabs>
      </div>
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
