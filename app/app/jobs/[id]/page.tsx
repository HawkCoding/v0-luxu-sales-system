"use client"

import { useJobDetail } from "@/lib/use-data"
import { useParams, useRouter, useSearchParams } from "next/navigation"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
import { useAuth } from "@/lib/auth-context"
import { AlertCircle, ArrowLeft, CheckCircle2, ChevronRight, ChevronLeft as ChevronLeftIcon, UserRound, XCircle } from "lucide-react"
import Link from "next/link"
import { JobEnquiryTab } from "@/components/job-enquiry-tab"
import { JobQuotesTab } from "@/components/job-quotes-tab"
import { JobPaymentsTab } from "@/components/job-payments-tab"
import { JobCorrespondenceTab } from "@/components/job-correspondence-tab"
import { JobDocumentsTab } from "@/components/job-documents-tab"
import { JobAuditTab } from "@/components/job-audit-tab"
import { CancelBookingDialog } from "@/components/cancel-booking-dialog"
import { StageTransitionModal } from "@/components/stage-transition-modal"
import { GenerateDepositInvoiceDialog } from "@/components/generate-deposit-invoice-dialog"
import { GenerateFinalInvoiceDialog } from "@/components/generate-final-invoice-dialog"
import { GenerateVoucherDialog } from "@/components/generate-voucher-dialog"
import { PresenceAvatars } from "@/components/presence-avatars"
import { useRecordPresence } from "@/hooks/use-record-presence"
import { useVersionedSave } from "@/hooks/use-versioned-save"
import type { GateFailure, ManualConfirmations } from "@/lib/pipeline/validate-transition"
import { getApiErrorMessage, parseStageTransitionFailurePayload } from "@/lib/pipeline/stage-transition-response"
import { toast } from "sonner"

interface JobPatchResponse {
  id: string
  updatedAt: string
}

type JobDetailTab = "enquiry" | "quotes" | "payments" | "correspondence" | "documents" | "audit"

const JOB_DETAIL_TABS = new Set<JobDetailTab>([
  "enquiry",
  "quotes",
  "payments",
  "correspondence",
  "documents",
  "audit",
])

function parseJobDetailTab(value: string | null): JobDetailTab {
  return value && JOB_DETAIL_TABS.has(value as JobDetailTab) ? (value as JobDetailTab) : "enquiry"
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
  const searchParams = useSearchParams()
  const { id } = useParams<{ id: string }>()
  const { data, isLoading, error, mutate } = useJobDetail(id)
  const { can, role } = useRole()
  const { user: currentUser } = useAuth()
  const { others, setEditing } = useRecordPresence("job", id)
  const hasLoadError = Boolean(error)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [changeCustomerOpen, setChangeCustomerOpen] = useState(false)
  const [transitionModalOpen, setTransitionModalOpen] = useState(false)
  const [transitionFailures, setTransitionFailures] = useState<GateFailure[]>([])
  const [transitionIsManager, setTransitionIsManager] = useState(false)
  const [transitionSubmitting, setTransitionSubmitting] = useState(false)
  const [depositInvoiceOpen, setDepositInvoiceOpen] = useState(false)
  const [finalInvoiceOpen, setFinalInvoiceOpen] = useState(false)
  const [voucherOpen, setVoucherOpen] = useState(false)
  const [pendingStage, setPendingStage] = useState<PipelineStage | null>(null)
  const [customerSearch, setCustomerSearch] = useState("")
  const [customerResults, setCustomerResults] = useState<Array<{ id: string; firstName: string; lastName: string; email: string }>>([])
  const [changingCustomer, setChangingCustomer] = useState(false)
  const [reassigningSalesperson, setReassigningSalesperson] = useState(false)
  const [resolvingImportReview, setResolvingImportReview] = useState(false)
  const [lastJobPayload, setLastJobPayload] = useState<Record<string, unknown> | null>(null)
  const [activeTab, setActiveTab] = useState<JobDetailTab>(() => parseJobDetailTab(searchParams.get("tab")))
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
    setEditing(cancelOpen || changeCustomerOpen || transitionModalOpen || depositInvoiceOpen || finalInvoiceOpen || voucherOpen)
  }, [cancelOpen, changeCustomerOpen, depositInvoiceOpen, finalInvoiceOpen, transitionModalOpen, voucherOpen, setEditing])

  useEffect(() => {
    setActiveTab(parseJobDetailTab(searchParams.get("tab")))
  }, [searchParams])

  if (isLoading || !data || hasLoadError) {
    return <JobDetailSkeleton />
  }

  const {
    job,
    customer,
    enquiry,
    itineraries,
    quotes,
    payments,
    invoices = [],
    documents,
    correspondence,
    auditLogs,
    salespeople = [],
    settings,
  } = data
  const currentStage = getCanonicalPipelineStage(job.stage as PipelineStage)
  const currentStageIdx = PIPELINE_STAGES.findIndex(s => s.key === currentStage)
  const consultantName = CONSULTANTS.find((consultant) => consultant.key === job.consultant)?.name ?? job.consultant ?? undefined
  const needsEmailReview = Boolean(enquiry?.emailImportNeedsReview)
  const canReassignSalesperson = role === "manager" || role === "admin"
  const canOwnBooking = role === "consultant" || role === "manager" || role === "admin"
  const canClaimBooking = canOwnBooking && job.assignedSalespersonId === null
  const canReleaseOwnBooking =
    role === "consultant" && Boolean(currentUser?.id) && job.assignedSalespersonId === currentUser?.id
  const assignedSalespersonName = job.assignedSalespersonName ?? "Unassigned"
  const hasNoPackageMatchQuote = quotes.some((quote: { noPackageMatch?: boolean }) => quote.noPackageMatch)
  const hasSentDepositInvoice = invoices.some(
    (invoice: { kind: string; status: string }) =>
      invoice.kind === "deposit" && (invoice.status === "sent" || invoice.status === "paid"),
  )
  const hasSentFinalInvoice = invoices.some(
    (invoice: { kind: string; status: string }) =>
      invoice.kind === "final" && (invoice.status === "sent" || invoice.status === "paid"),
  )

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

  const resetPendingTransition = () => {
    setTransitionModalOpen(false)
    setTransitionFailures([])
    setTransitionIsManager(false)
    setPendingStage(null)
  }

  const moveStageTo = async (
    targetStage: PipelineStage,
    options?: { manualConfirmations?: ManualConfirmations; overrideReason?: string },
  ) => {
    setTransitionSubmitting(true)
    try {
      const response = await fetch(`/api/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: targetStage,
          expectedUpdatedAt: data.job.updatedAt,
          manualConfirmations: options?.manualConfirmations,
          override: Boolean(options?.overrideReason),
          overrideReason: options?.overrideReason,
        }),
      })

      const payload = await response.json().catch(() => null)
      const stageGatePayload = response.status === 422 ? parseStageTransitionFailurePayload(payload) : null
      if (stageGatePayload) {
        const canGenerateDepositInvoice =
          targetStage === "deposit_requested" &&
          stageGatePayload.failures.some((failure) => failure.autoFixable === "create_invoice_25pct")
        if (canGenerateDepositInvoice) {
          setPendingStage(targetStage)
          setTransitionFailures(stageGatePayload.failures)
          setTransitionIsManager(stageGatePayload.isManager)
          setDepositInvoiceOpen(true)
          return
        }
        const canGenerateFinalInvoice =
          targetStage === "final_paid" &&
          stageGatePayload.failures.some((failure) => failure.autoFixable === "create_final_invoice")
        if (canGenerateFinalInvoice) {
          setPendingStage(targetStage)
          setTransitionFailures(stageGatePayload.failures)
          setTransitionIsManager(stageGatePayload.isManager)
          setFinalInvoiceOpen(true)
          return
        }
        const canGenerateVoucher =
          targetStage === "voucher_sent" &&
          stageGatePayload.failures.some((failure) => failure.autoFixable === "create_voucher_pdf")
        if (canGenerateVoucher) {
          setPendingStage(targetStage)
          setTransitionFailures(stageGatePayload.failures)
          setTransitionIsManager(stageGatePayload.isManager)
          setVoucherOpen(true)
          return
        }

        setTransitionFailures(stageGatePayload.failures)
        setTransitionIsManager(stageGatePayload.isManager)
        setPendingStage(targetStage)
        setTransitionModalOpen(true)
        return
      }

      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "Stage move failed"))
      }

      await mutate()
      resetPendingTransition()
      toast.success("Stage updated")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Stage move failed")
    } finally {
      setTransitionSubmitting(false)
    }
  }

  const moveStage = async (direction: "forward" | "back") => {
    if (needsEmailReview && direction === "forward") return
    const newIdx = direction === "forward" ? currentStageIdx + 1 : currentStageIdx - 1
    if (newIdx < 0 || newIdx >= PIPELINE_STAGES.length) return
    await moveStageTo(PIPELINE_STAGES[newIdx].key)
  }

  const resolveEmailReview = async () => {
    setResolvingImportReview(true)
    try {
      const response = await fetch(`/api/jobs/${id}/clear-import-review`, { method: "POST" })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not resolve import review")
      }
      await mutate()
      toast.success("Import review cleared")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not resolve import review")
    } finally {
      setResolvingImportReview(false)
    }
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

  const reassignSalesperson = async (salespersonId: string) => {
    setReassigningSalesperson(true)
    try {
      const response = await fetch(`/api/jobs/${id}/ownership`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          salespersonId === "__unassigned"
            ? { action: "release" }
            : { action: "assign", userId: salespersonId },
        ),
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not update salesperson")
      }
      await mutate()
      toast.success("Salesperson reassigned")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update salesperson")
    } finally {
      setReassigningSalesperson(false)
    }
  }

  const updateOwnership = async (action: "claim" | "release") => {
    setReassigningSalesperson(true)
    try {
      const response = await fetch(`/api/jobs/${id}/ownership`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not update ownership")
      }
      await mutate()
      toast.success(action === "claim" ? "Booking claimed" : "Booking released")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update ownership")
    } finally {
      setReassigningSalesperson(false)
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
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Salesperson</span>
              {canReassignSalesperson ? (
                <Select
                  value={job.assignedSalespersonId ?? "__unassigned"}
                  onValueChange={(value) => void reassignSalesperson(value)}
                  disabled={reassigningSalesperson || isSavingJob}
                >
                  <SelectTrigger size="sm" className="h-8 w-56 bg-background">
                    <SelectValue placeholder="Assign salesperson" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unassigned">Unassigned</SelectItem>
                    {salespeople.map((salesperson: { id: string; name: string; email: string }) => (
                      <SelectItem key={salesperson.id} value={salesperson.id}>
                        {salesperson.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span>{assignedSalespersonName}</span>
              )}
              {canClaimBooking && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={reassigningSalesperson}
                  onClick={() => void updateOwnership("claim")}
                >
                  <UserRound className="mr-1.5 h-3.5 w-3.5" />
                  Claim
                </Button>
              )}
              {canReleaseOwnBooking && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={reassigningSalesperson}
                  onClick={() => void updateOwnership("release")}
                >
                  Release
                </Button>
              )}
            </div>
          </div>
        </div>
        {can("edit:pipeline") && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={currentStageIdx <= 0 || transitionSubmitting} onClick={() => moveStage("back")}>
              <ChevronLeftIcon className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button size="sm" disabled={currentStageIdx >= PIPELINE_STAGES.length - 1 || needsEmailReview || isSavingJob || transitionSubmitting} onClick={() => moveStage("forward")}>
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
                <Button size="sm" onClick={resolveEmailReview} disabled={resolvingImportReview}>
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  {resolvingImportReview ? "Resolving" : "Resolve review"}
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

      {hasNoPackageMatchQuote && (
        <Alert className="border-yellow-300 bg-yellow-50 text-yellow-950">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No package matched</AlertTitle>
          <AlertDescription>
            No package was matched from the email - pricing not pre-filled. Add line items manually before sending.
          </AlertDescription>
        </Alert>
      )}

      {can("send:correspondence") && (!hasSentDepositInvoice || !hasSentFinalInvoice) && (
        <div className="flex justify-end gap-2">
          {!hasSentFinalInvoice ? (
            <GenerateFinalInvoiceDialog
              jobId={id}
              bookingNumber={job.jobNumber}
              customerName={`${customer?.firstName ?? ""} ${customer?.lastName ?? ""}`.trim()}
              quotes={quotes}
              payments={payments}
              onSent={async () => {
                await mutate()
                resetPendingTransition()
              }}
            />
          ) : null}
          {!hasSentDepositInvoice ? (
          <GenerateDepositInvoiceDialog
            jobId={id}
            bookingNumber={job.jobNumber}
            customerName={`${customer?.firstName ?? ""} ${customer?.lastName ?? ""}`.trim()}
            quotes={quotes}
            defaultDepositPercentage={settings?.defaultDepositPercentage ?? 25}
            onSent={async () => {
              await mutate()
              resetPendingTransition()
            }}
          />
          ) : null}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(parseJobDetailTab(value))} className="space-y-4">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="enquiry" className="text-xs">Enquiry</TabsTrigger>
          <TabsTrigger value="quotes" className="text-xs">Quotes ({quotes.length})</TabsTrigger>
          <TabsTrigger value="payments" className="text-xs">Payments ({payments.length})</TabsTrigger>
          <TabsTrigger value="correspondence" className="text-xs">Emails Sent ({correspondence.length})</TabsTrigger>
          <TabsTrigger value="documents" className="text-xs">Documents ({documents.length})</TabsTrigger>
          <TabsTrigger value="audit" className="text-xs">Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="enquiry">
          <JobEnquiryTab
            enquiry={enquiry}
            itineraries={itineraries}
            stage={job.stage}
            hasDraftQuotes={quotes.some((quote: { status: string }) => quote.status === "draft")}
            onQuoteStarted={async () => {
              await mutate()
              setActiveTab("quotes")
            }}
            onTransportRequestsChange={mutate}
          />
        </TabsContent>
        <TabsContent value="quotes">
          <JobQuotesTab
            quotes={quotes}
            jobId={id}
            bookingNumber={job.jobNumber}
            itineraries={itineraries}
            travelDate={enquiry?.departureDate ?? null}
            noOfAdults={enquiry?.noOfAdults ?? 0}
            noOfChildren={enquiry?.noOfChildren ?? 0}
            customerName={`${customer?.firstName ?? ""} ${customer?.lastName ?? ""}`.trim()}
            emailImportNeedsReview={needsEmailReview}
            mutate={mutate}
          />
        </TabsContent>
        <TabsContent value="payments">
          <JobPaymentsTab
            payments={payments}
            jobId={id}
            depositPaid={job.depositPaid ?? false}
            invoiceBalance={job.invoiceBalance ?? null}
            mutate={mutate}
          />
        </TabsContent>
        <TabsContent value="correspondence">
          <JobCorrespondenceTab correspondence={correspondence} jobId={id} mutate={mutate} />
        </TabsContent>
        <TabsContent value="documents">
          <JobDocumentsTab documents={documents} job={job} enquiry={enquiry} customer={customer} onChange={mutate} />
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

      <StageTransitionModal
        open={transitionModalOpen}
        jobId={id}
        jobNumber={job.jobNumber}
        targetStage={pendingStage}
        failures={transitionFailures}
        isManager={transitionIsManager}
        submitting={transitionSubmitting}
        onCancel={resetPendingTransition}
        onProceed={async (manualConfirmations) => {
          if (!pendingStage) return
          await moveStageTo(pendingStage, { manualConfirmations })
        }}
        onOverride={async (overrideReason) => {
          if (!pendingStage) return
          await moveStageTo(pendingStage, { overrideReason })
        }}
      />

      <GenerateDepositInvoiceDialog
        open={depositInvoiceOpen}
        onOpenChange={setDepositInvoiceOpen}
        trigger={false}
        jobId={id}
        bookingNumber={job.jobNumber}
        customerName={`${customer?.firstName ?? ""} ${customer?.lastName ?? ""}`.trim()}
        quotes={quotes}
        defaultDepositPercentage={settings?.defaultDepositPercentage ?? 25}
        onSent={async () => {
          setDepositInvoiceOpen(false)
          await mutate()
          resetPendingTransition()
        }}
      />

      <GenerateFinalInvoiceDialog
        open={finalInvoiceOpen}
        onOpenChange={setFinalInvoiceOpen}
        trigger={false}
        jobId={id}
        bookingNumber={job.jobNumber}
        customerName={`${customer?.firstName ?? ""} ${customer?.lastName ?? ""}`.trim()}
        quotes={quotes}
        payments={payments}
        onSent={async () => {
          setFinalInvoiceOpen(false)
          await mutate()
          resetPendingTransition()
        }}
      />

      <GenerateVoucherDialog
        open={voucherOpen}
        onOpenChange={setVoucherOpen}
        trigger={false}
        jobId={id}
        bookingNumber={job.jobNumber}
        onGenerated={async () => {
          await mutate()
        }}
        onSent={async () => {
          setVoucherOpen(false)
          await mutate()
          resetPendingTransition()
        }}
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
    <div className="min-w-0">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "var(--font-inter)" }}>{label}</p>
      <p className="text-sm text-foreground mt-0.5 truncate" title={value}>{value || "-"}</p>
    </div>
  )
}
