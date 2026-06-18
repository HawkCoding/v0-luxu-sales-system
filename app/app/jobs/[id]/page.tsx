"use client"

import { useJobDetail, useAssignableUsers } from "@/lib/use-data"
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
  DialogFooter,
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
import { AlertCircle, ArrowLeft, CheckCircle2, ChevronRight, ChevronLeft as ChevronLeftIcon, UserRound, XCircle, Target, UserPlus, UserMinus } from "lucide-react"
import type { Outcome, OutcomeReason } from "@/lib/types"
import Link from "next/link"
import { JobEnquiryTab } from "@/components/job-enquiry-tab"
import { JobQuotesTab } from "@/components/job-quotes-tab"
import { JobPaymentsTab } from "@/components/job-payments-tab"
import { JobCorrespondenceTab } from "@/components/job-correspondence-tab"
import { JobDocumentsTab } from "@/components/job-documents-tab"
import { JobAttachmentsTab } from "@/components/job-attachments-tab"
import { JobInternalNotesTab } from "@/components/job-internal-notes-tab"
import { JobAuditTab } from "@/components/job-audit-tab"
import { BookingStageStepper } from "@/components/booking-stage-stepper"
import { CancelBookingDialog } from "@/components/cancel-booking-dialog"
import { StageTransitionModal } from "@/components/stage-transition-modal"
import { GenerateDepositInvoiceDialog } from "@/components/generate-deposit-invoice-dialog"
import { GenerateFinalInvoiceDialog } from "@/components/generate-final-invoice-dialog"
import { GenerateVoucherDialog } from "@/components/generate-voucher-dialog"
import { BookingPackageSection } from "@/components/booking-package-section"
import { PresenceAvatars } from "@/components/presence-avatars"
import { useRecordPresence } from "@/hooks/use-record-presence"
import { useVersionedSave } from "@/hooks/use-versioned-save"
import { useBookingNotes } from "@/lib/use-data"
import type { GateFailure, ManualConfirmations } from "@/lib/pipeline/validate-transition"
import { getApiErrorMessage, parseStageTransitionFailurePayload } from "@/lib/pipeline/stage-transition-response"
import { toast } from "sonner"

interface JobPatchResponse {
  id: string
  updatedAt: string
}

type JobDetailTab =
  | "enquiry"
  | "package"
  | "quotes"
  | "payments"
  | "correspondence"
  | "documents"
  | "attachments"
  | "notes"
  | "audit"

const JOB_DETAIL_TABS = new Set<JobDetailTab>([
  "enquiry",
  "package",
  "quotes",
  "payments",
  "correspondence",
  "documents",
  "attachments",
  "notes",
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
          {Array.from({ length: 9 }).map((_, index) => (
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

// Sentinel for the reassign picker's "Unassigned" choice. Radix SelectItem
// disallows an empty-string value, so we map this to null on submit.
const UNASSIGNED_VALUE = "__unassigned__"

export default function JobDetailPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { id } = useParams<{ id: string }>()
  const { data, isLoading, error, mutate } = useJobDetail(id)
  const { can, role } = useRole()
  const { user: authUser } = useAuth()
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
  const [resolvingImportReview, setResolvingImportReview] = useState(false)
  const [ownerSubmitting, setOwnerSubmitting] = useState(false)
  const [lastJobPayload, setLastJobPayload] = useState<Record<string, unknown> | null>(null)
  const [activeTab, setActiveTab] = useState<JobDetailTab>(() => parseJobDetailTab(searchParams.get("tab")))
  const [supplierRefDraft, setSupplierRefDraft] = useState<string>("")
  const [supplierRefSaving, setSupplierRefSaving] = useState(false)
  const [reassignOpen, setReassignOpen] = useState(false)
  const [reassignTarget, setReassignTarget] = useState<string>("")
  const [reassignSubmitting, setReassignSubmitting] = useState(false)
  const { data: assignableData } = useAssignableUsers(reassignOpen)
  const {
    data: notesData,
    error: notesError,
    isLoading: notesLoading,
    mutate: mutateNotes,
  } = useBookingNotes(activeTab === "notes" ? id : null)
  const [outcomeOpen, setOutcomeOpen] = useState(false)
  const [outcomeSubmitting, setOutcomeSubmitting] = useState(false)
  const [pendingOutcome, setPendingOutcome] = useState<Outcome>("Open")
  const [pendingReasonId, setPendingReasonId] = useState<string>("")
  const [pendingNotes, setPendingNotes] = useState<string>("")
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

  useEffect(() => {
    const next = (data?.job as { supplierReference?: string | null } | undefined)?.supplierReference ?? ""
    setSupplierRefDraft(next)
  }, [data?.job])

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
    outcomeReasons = [],
    settings,
  } = data
  const currentStage = getCanonicalPipelineStage(job.stage as PipelineStage)
  const currentStageIdx = PIPELINE_STAGES.findIndex(s => s.key === currentStage)
  const consultantName = CONSULTANTS.find((consultant) => consultant.key === job.consultant)?.name ?? job.consultant ?? undefined
  const needsEmailReview = Boolean(enquiry?.emailImportNeedsReview)
  const assignedSalespersonName = job.assignedSalespersonName ?? "Unassigned"
  const assignedSalespersonId = (job as { assignedSalespersonId?: string | null }).assignedSalespersonId ?? null
  const canReassign = role === "manager" || role === "admin"
  // Self-serve owner controls for consultants: take an unassigned job, release one they own.
  const isOwnedByMe = Boolean(assignedSalespersonId) && assignedSalespersonId === authUser?.id
  const canTake = can("edit:jobs") && !assignedSalespersonId
  const canRelease = can("edit:jobs") && isOwnedByMe
  const hasNoPackageMatchQuote = quotes.some((quote: { noPackageMatch?: boolean }) => quote.noPackageMatch)
  const hasSentDepositInvoice = invoices.some(
    (invoice: { kind: string; status: string }) =>
      invoice.kind === "deposit" && (invoice.status === "sent" || invoice.status === "paid"),
  )
  const hasSentFinalInvoice = invoices.some(
    (invoice: { kind: string; status: string }) =>
      invoice.kind === "final" && (invoice.status === "sent" || invoice.status === "paid"),
  )

  const canEditSupplierRef = can("edit:jobs")
  const currentSupplierRef = (job as { supplierReference?: string | null } | undefined)?.supplierReference ?? ""
  const supplierRefDirty = supplierRefDraft !== currentSupplierRef

  const saveSupplierReference = async () => {
    if (!supplierRefDirty || supplierRefSaving) return
    setSupplierRefSaving(true)
    try {
      const response = await fetch(`/api/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierReference: supplierRefDraft.trim().length > 0 ? supplierRefDraft.trim() : null,
          expectedUpdatedAt: data?.job?.updatedAt,
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        toast.error(typeof payload?.error === "string" ? payload.error : "Could not save supplier reference")
        return
      }
      toast.success("Supplier reference saved")
      await mutate()
    } finally {
      setSupplierRefSaving(false)
    }
  }

  const openReassign = () => {
    setReassignTarget(assignedSalespersonId ?? UNASSIGNED_VALUE)
    setReassignOpen(true)
  }

  const submitReassign = async () => {
    if (reassignSubmitting) return
    const next = reassignTarget === UNASSIGNED_VALUE ? null : reassignTarget || null
    if (next === assignedSalespersonId) {
      setReassignOpen(false)
      return
    }
    setReassignSubmitting(true)
    try {
      const response = await fetch(`/api/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedSalespersonId: next, expectedUpdatedAt: data?.job?.updatedAt }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        toast.error(typeof payload?.error === "string" ? payload.error : "Could not reassign job")
        return
      }
      toast.success("Job reassigned")
      setReassignOpen(false)
      await mutate()
    } finally {
      setReassignSubmitting(false)
    }
  }

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
      const stageGatePayload = response.status === 400 ? parseStageTransitionFailurePayload(payload) : null
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

  const setOwner = async (next: string | null, successMessage: string, failMessage: string) => {
    setOwnerSubmitting(true)
    try {
      const response = await fetch(`/api/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedSalespersonId: next, expectedUpdatedAt: data?.job?.updatedAt }),
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? failMessage)
      await mutate()
      toast.success(successMessage)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : failMessage)
    } finally {
      setOwnerSubmitting(false)
    }
  }

  const takeJob = () => {
    if (!authUser?.id) return
    void setOwner(authUser.id, "Job assigned to you", "Could not take job")
  }

  const releaseJob = () => void setOwner(null, "Job released", "Could not release job")

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

  const setOutcome = async () => {
    setOutcomeSubmitting(true)
    try {
      const body: Record<string, unknown> = { outcome: pendingOutcome }
      if (pendingReasonId) body.reasonId = pendingReasonId
      if (pendingNotes.trim()) body.outcomeNotes = pendingNotes.trim()
      const response = await fetch(`/api/jobs/${id}/outcome`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not update outcome")
      }
      await mutate()
      setOutcomeOpen(false)
      toast.success("Outcome updated")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update outcome")
    } finally {
      setOutcomeSubmitting(false)
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
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold text-foreground tracking-tight" style={{ fontFamily: "var(--font-inter)" }}>{job.jobNumber}</h1>
              <Badge variant="outline" className="text-xs">{getPipelineStageLabel(job.stage)}</Badge>
              <Badge variant="secondary" className="text-xs">{job.purpose}</Badge>
              {job.isRepeatClientAtCreation ? (
                <Badge variant="outline" className="text-xs">Repeat Client</Badge>
              ) : null}
              {(() => {
                const outcome = (job.outcome as Outcome | undefined) ?? "Open"
                const colors: Record<Outcome, string> = {
                  Open: "bg-blue-50 text-blue-700 border-blue-200",
                  Won: "bg-green-50 text-green-700 border-green-200",
                  Lost: "bg-red-50 text-red-700 border-red-200",
                  Cancelled: "bg-orange-50 text-orange-700 border-orange-200",
                }
                return (
                  <button
                    type="button"
                    onClick={() => {
                      setPendingOutcome(outcome)
                      setPendingReasonId("")
                      setPendingNotes("")
                      setOutcomeOpen(true)
                    }}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80 ${colors[outcome]}`}
                    aria-label={`Outcome: ${outcome}. Click to change.`}
                    title="Click to change outcome"
                  >
                    <Target className="w-3 h-3" aria-hidden="true" />
                    {outcome}
                  </button>
                )
              })()}
              {needsEmailReview && <Badge variant="destructive" className="text-xs">Needs Review</Badge>}
              <PresenceAvatars users={others} className="ml-1" />
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {customer?.firstName} {customer?.lastName} &middot; {customer?.email}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Salesperson</span>
              <span>{assignedSalespersonName}</span>
              {canTake && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs"
                  disabled={ownerSubmitting}
                  onClick={takeJob}
                  aria-label="Take this job"
                >
                  <UserPlus className="w-3 h-3 mr-1" />
                  {ownerSubmitting ? "Taking…" : "Take"}
                </Button>
              )}
              {canRelease && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs"
                  disabled={ownerSubmitting}
                  onClick={releaseJob}
                  aria-label="Release this job"
                >
                  <UserMinus className="w-3 h-3 mr-1" />
                  {ownerSubmitting ? "Releasing…" : "Release"}
                </Button>
              )}
              {canReassign && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs"
                  onClick={openReassign}
                  aria-label="Reassign this job"
                >
                  <UserRound className="w-3 h-3 mr-1" />
                  Reassign
                </Button>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Label htmlFor="booking-supplier-reference" className="font-medium text-foreground">
                Supplier ref
              </Label>
              {canEditSupplierRef ? (
                <>
                  <Input
                    id="booking-supplier-reference"
                    value={supplierRefDraft}
                    onChange={(e) => setSupplierRefDraft(e.target.value)}
                    onBlur={() => void saveSupplierReference()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        void saveSupplierReference()
                      }
                    }}
                    placeholder="Supplier confirmation #"
                    maxLength={120}
                    disabled={supplierRefSaving}
                    className="h-8 w-56 bg-background"
                  />
                  {supplierRefDirty ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => void saveSupplierReference()}
                      disabled={supplierRefSaving}
                    >
                      {supplierRefSaving ? "Saving..." : "Save"}
                    </Button>
                  ) : null}
                </>
              ) : (
                <span>{currentSupplierRef || "—"}</span>
              )}
            </div>
          </div>
        </div>
        {can("edit:pipeline") && (
          <div className="flex flex-col items-end gap-1">
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
            {needsEmailReview && (
              <p className="text-[11px] text-muted-foreground">Resolve email review to advance</p>
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
      <BookingStageStepper currentStage={job.stage as PipelineStage} />

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
          <TabsTrigger value="package" className="text-xs">Package</TabsTrigger>
          <TabsTrigger value="quotes" className="text-xs">Quotes ({quotes.length})</TabsTrigger>
          <TabsTrigger value="payments" className="text-xs">Payments ({payments.length})</TabsTrigger>
          <TabsTrigger value="correspondence" className="text-xs">Emails Sent ({correspondence.length})</TabsTrigger>
          <TabsTrigger value="documents" className="text-xs">Documents ({documents.length})</TabsTrigger>
          <TabsTrigger value="attachments" className="text-xs">Attachments</TabsTrigger>
          <TabsTrigger value="notes" className="text-xs">Notes</TabsTrigger>
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
            onFieldsUpdated={mutate}
          />
        </TabsContent>
        <TabsContent value="package">
          <BookingPackageSection jobId={id} />
        </TabsContent>
        <TabsContent value="quotes">
          <JobQuotesTab
            quotes={quotes}
            jobId={id}
            bookingNumber={job.jobNumber}
            travelDate={enquiry?.departureDate ?? null}
            noOfAdults={enquiry?.noOfAdults ?? 0}
            noOfChildren={enquiry?.noOfChildren ?? 0}
            customerName={`${customer?.firstName ?? ""} ${customer?.lastName ?? ""}`.trim()}
            customerDefaultRateTypeId={customer?.defaultRateTypeId ?? null}
            emailImportNeedsReview={needsEmailReview}
            mutate={mutate}
          />
        </TabsContent>
        <TabsContent value="payments">
          <JobPaymentsTab
            payments={payments}
            jobId={id}
            mutate={mutate}
            stage={currentStage}
          />
        </TabsContent>
        <TabsContent value="correspondence">
          <JobCorrespondenceTab correspondence={correspondence} jobId={id} mutate={mutate} />
        </TabsContent>
        <TabsContent value="documents">
          <JobDocumentsTab
            documents={documents}
            job={job}
            enquiry={enquiry}
            customer={customer}
            itineraries={itineraries}
            onChange={mutate}
            loading={isLoading}
            error={error as Error | null}
          />
        </TabsContent>
        <TabsContent value="attachments">
          <JobAttachmentsTab
            bookingId={id}
            documents={documents}
            loading={isLoading}
            error={error as Error | null}
            onChange={mutate}
          />
        </TabsContent>
        <TabsContent value="notes">
          <JobInternalNotesTab
            bookingId={id}
            notes={notesData?.notes ?? []}
            loading={notesLoading}
            error={notesError as Error | null}
            onChange={async () => {
              await mutateNotes()
            }}
          />
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
        outcomeReasons={outcomeReasons as OutcomeReason[]}
        suggestedRefund={job.suggestedRefund ?? null}
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
        onSendFinalInvoice={() => {
          setFinalInvoiceOpen(true)
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

      {/* Outcome Dialog */}
      <Dialog open={outcomeOpen} onOpenChange={(open) => { if (!outcomeSubmitting) setOutcomeOpen(open) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set Outcome</DialogTitle>
            <DialogDescription>
              Record the final result for this booking.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="outcome-select">Outcome</Label>
              <Select value={pendingOutcome} onValueChange={(v) => { setPendingOutcome(v as Outcome); setPendingReasonId("") }}>
                <SelectTrigger id="outcome-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["Open", "Won", "Lost", "Cancelled"] as Outcome[]).map((o) => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(pendingOutcome === "Lost" || pendingOutcome === "Cancelled") && (
              <div className="space-y-1.5">
                <Label htmlFor="outcome-reason">Reason <span aria-hidden="true" className="text-destructive">*</span></Label>
                <Select value={pendingReasonId} onValueChange={setPendingReasonId}>
                  <SelectTrigger id="outcome-reason">
                    <SelectValue placeholder="Select a reason…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(outcomeReasons as OutcomeReason[])
                      .filter((r) => r.appliesTo === pendingOutcome || r.appliesTo === "Both")
                      .map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {(() => {
              const selectedReason = (outcomeReasons as OutcomeReason[]).find((r) => r.id === pendingReasonId)
              if (!selectedReason || selectedReason.label !== "Other") return null
              return (
                <div className="space-y-1.5">
                  <Label htmlFor="outcome-notes">Notes <span aria-hidden="true" className="text-destructive">*</span></Label>
                  <Input
                    id="outcome-notes"
                    value={pendingNotes}
                    onChange={(e) => setPendingNotes(e.target.value)}
                    placeholder="Briefly describe the reason…"
                    maxLength={500}
                  />
                </div>
              )
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={outcomeSubmitting} onClick={() => setOutcomeOpen(false)}>Cancel</Button>
            <Button
              onClick={() => void setOutcome()}
              disabled={
                outcomeSubmitting ||
                ((pendingOutcome === "Lost" || pendingOutcome === "Cancelled") && !pendingReasonId) ||
                (() => {
                  const r = (outcomeReasons as OutcomeReason[]).find((x) => x.id === pendingReasonId)
                  return r?.label === "Other" && !pendingNotes.trim()
                })()
              }
            >
              {outcomeSubmitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <Dialog open={reassignOpen} onOpenChange={(open) => { if (!reassignSubmitting) setReassignOpen(open) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign job</DialogTitle>
            <DialogDescription>
              Move this booking to a different salesperson. The change is recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Salesperson</Label>
            <Select value={reassignTarget} onValueChange={setReassignTarget}>
              <SelectTrigger>
                <SelectValue placeholder="Select a salesperson" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED_VALUE}>Unassigned</SelectItem>
                {(assignableData?.users ?? []).map((u) => (
                  <SelectItem key={u.userId} value={u.userId}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignOpen(false)} disabled={reassignSubmitting}>
              Cancel
            </Button>
            <Button onClick={() => void submitReassign()} disabled={reassignSubmitting || !reassignTarget}>
              {reassignSubmitting ? "Reassigning..." : "Reassign"}
            </Button>
          </DialogFooter>
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