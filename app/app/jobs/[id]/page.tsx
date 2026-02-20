"use client"

import { useJobDetail } from "@/lib/use-data"
import { useParams } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading, mutate } = useJobDetail(id)
  const { can } = useRole()

  if (isLoading || !data) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 bg-secondary rounded" />
          <div className="h-64 bg-secondary rounded-lg" />
        </div>
      </div>
    )
  }

  if (data.error) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Job not found</p>
        <Link href="/app/jobs" className="text-sm text-brand-gold hover:underline mt-2 inline-block">Back to Jobs</Link>
      </div>
    )
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
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/app/jobs">
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
