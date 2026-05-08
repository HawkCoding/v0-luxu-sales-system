"use client"

import { usePipeline, useAllData } from "@/lib/use-data"
import { formatDisplayDate } from "@/lib/date-format"
import { depositPercentageToRate } from "@/lib/pipeline/constants"
import {
  getCanonicalPipelineStage,
  getPipelineStageLabel,
  PIPELINE_STAGES,
  KANBAN_STAGES,
  CONSULTANTS,
  type PipelineStage,
  type ConsultantAbbreviation,
} from "@/lib/types"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useRole } from "@/lib/role-context"
import { NewEnquiryDialog } from "@/components/new-enquiry-dialog"
import Link from "next/link"
import { useState, useEffect } from "react"
import { CheckCircle2, GripVertical, Search, Clipboard, Plus, Settings, Download } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { downloadAuditLog } from "@/lib/export-audit"
import { toast } from "sonner"
import { StageTransitionModal } from "@/components/stage-transition-modal"
import type { GateFailure, ManualConfirmations } from "@/lib/pipeline/validate-transition"
import { useRouter } from "next/navigation"

interface PipelineJob {
  id: string
  bookingNumber: string
  customerName: string
  direction: string
  departureDate: string
  stage: PipelineStage
  consultant: ConsultantAbbreviation
  paymentColor: string
  totalPaid: number
  quoteTotal: number
  tripEndDate: string | null
  thankYouScheduledAt: string | null
}

const PAYMENT_COLORS: Record<string, string> = {
  green: "bg-payment-green",
  yellow: "bg-payment-yellow",
  red: "bg-payment-red",
  purple: "bg-payment-purple",
  blue: "bg-payment-blue",
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  green: "Fully paid",
  yellow: "Deposit paid",
  purple: "Partial payment",
  red: "No payment",
  blue: "Credit / refund",
}

function isPastOrToday(dateString: string | null): boolean {
  if (!dateString) return false
  const today = new Date()
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const [year = "1970", month = "1", day = "1"] = dateString.split("-")
  const dateUtc = Date.UTC(Number(year), Number(month) - 1, Number(day))
  return dateUtc <= todayUtc
}

export default function PipelinePage() {
  const router = useRouter()
  const { data: jobs, isLoading: loadingJobs, error: jobsError, mutate: mutateJobs } = usePipeline()
  const { data, isLoading: loadingAll, error: allDataError, mutate: mutateAll } = useAllData()
  const { can } = useRole()
  const [draggedJob, setDraggedJob] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [stageFilter, setStageFilter] = useState("all")
  const [newEnquiryOpen, setNewEnquiryOpen] = useState(false)
  const [showAllItems, setShowAllItems] = useState(false)
  const [consultantFilter, setConsultantFilter] = useState<"all" | ConsultantAbbreviation>("all")
  
  const [transitionModalOpen, setTransitionModalOpen] = useState(false)
  const [transitionFailures, setTransitionFailures] = useState<GateFailure[]>([])
  const [transitionIsManager, setTransitionIsManager] = useState(false)
  const [transitionSubmitting, setTransitionSubmitting] = useState(false)
  const [pendingJobId, setPendingJobId] = useState<string | null>(null)
  const [pendingToStage, setPendingToStage] = useState<PipelineStage | null>(null)

  // Load showAllItems setting from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("pipeline_showAllItems")
    if (saved !== null) {
      setShowAllItems(saved === "true")
    }
  }, [])

  // Save showAllItems setting to localStorage
  const toggleShowAllItems = (checked: boolean) => {
    setShowAllItems(checked)
    localStorage.setItem("pipeline_showAllItems", checked.toString())
  }

  const handleDragStart = (e: React.DragEvent, jobId: string) => {
    if (!can("edit:pipeline")) return
    e.dataTransfer.setData("text/plain", jobId)
    setDraggedJob(jobId)
  }

  const handleDragOver = (e: React.DragEvent, stage: string) => {
    e.preventDefault()
    setDragOverStage(stage)
  }

  const handleDragLeave = () => {
    setDragOverStage(null)
  }

  const resetPendingTransition = () => {
    setTransitionModalOpen(false)
    setTransitionFailures([])
    setTransitionIsManager(false)
    setPendingJobId(null)
    setPendingToStage(null)
  }

  const moveJob = async (
    jobId: string,
    toStage: PipelineStage,
    options?: { manualConfirmations?: ManualConfirmations; overrideReason?: string },
  ) => {
    setTransitionSubmitting(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: toStage,
          manualConfirmations: options?.manualConfirmations,
          override: Boolean(options?.overrideReason),
          overrideReason: options?.overrideReason,
        }),
      })

      const payload = await response.json().catch(() => null)
      if (response.status === 422 && payload?.failures) {
        setTransitionFailures(payload.failures)
        setTransitionIsManager(Boolean(payload.isManager))
        setPendingJobId(jobId)
        setPendingToStage(toStage)
        setTransitionModalOpen(true)
        return
      }

      if (!response.ok) {
        throw new Error(payload?.error ?? "Stage move failed")
      }

      await mutateJobs()
      await mutateAll()
      resetPendingTransition()
      toast.success("Stage updated")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Stage move failed")
    } finally {
      setTransitionSubmitting(false)
    }
  }

  const handleDrop = async (e: React.DragEvent, toStage: PipelineStage) => {
    e.preventDefault()
    const jobId = e.dataTransfer.getData("text/plain")
    setDraggedJob(null)
    setDragOverStage(null)
    if (!jobId || !can("edit:pipeline")) return

    const job = (jobs as PipelineJob[]).find((j) => j.id === jobId)
    if (!job || job.stage === toStage) return

    const preflight = await fetch(`/api/jobs/${jobId}/validate-stage-move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetStage: toStage }),
    })
    const payload = await preflight.json().catch(() => null)
    if (!preflight.ok) {
      toast.error(payload?.error ?? "Could not validate stage move")
      return
    }

    if (payload.failures?.length) {
      setTransitionFailures(payload.failures)
      setTransitionIsManager(Boolean(payload.isManager))
      setPendingJobId(jobId)
      setPendingToStage(toStage)
      setTransitionModalOpen(true)
      return
    }

    await moveJob(jobId, toStage)
  }

  if (loadingJobs || loadingAll) {
    return <div className="p-6"><div className="animate-pulse space-y-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-secondary rounded-lg" />)}</div></div>
  }

  if (jobsError || allDataError) {
    return (
      <div className="p-6">
        <Card className="border-dashed">
          <CardContent className="p-12">
            <div className="space-y-2 text-center">
              <Clipboard className="mx-auto h-12 w-12 text-muted-foreground/40" />
              <p className="text-base font-medium text-foreground">Failed to load pipeline</p>
              <p className="text-sm text-muted-foreground">
                Something went wrong while loading pipeline data. Try again.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => {
                  void mutateJobs()
                  void mutateAll()
                }}
              >
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!jobs || !data) {
    return null
  }

  // Filter jobs by consultant before grouping
  const filteredJobs = consultantFilter === "all" 
    ? (jobs as PipelineJob[])
    : ((jobs as PipelineJob[]) || []).filter((j: any) => j.consultant === consultantFilter)

  // Group jobs by configured Kanban stages
  const grouped = KANBAN_STAGES.reduce(
    (acc, stage) => {
      acc[stage.key] = (filteredJobs || []).filter((j) => stage.includes.includes(j.stage))
      return acc
    },
    {} as Record<string, PipelineJob[]>
  )

  const enriched = data.bookings.map((b: any) => {
    const customer = data.customers.find((c: any) => c.id === b.customerId)
    const payments = data.payments.filter((p: any) => p.bookingId === b.id)
    const quotes = data.quotes.filter((q: any) => q.bookingId === b.id)
    const totalPaid = payments.reduce((s: number, p: any) => s + p.amount, 0)
    const quoteTotal = quotes.reduce((s: number, q: any) => Math.max(s, q.total), 0) || 1
    const defaultDepositRate = depositPercentageToRate(data.settings?.defaultDepositPercentage)
    let paymentColor = "red"
    if (totalPaid < 0) paymentColor = "blue"
    else if (totalPaid >= quoteTotal && totalPaid > 0) paymentColor = "green"
    else if (totalPaid >= quoteTotal * defaultDepositRate) paymentColor = "yellow"
    else if (totalPaid > 0) paymentColor = "purple"
    return {
      ...b,
      customerName: customer ? `${customer.firstName} ${customer.lastName}` : "Unknown",
      paymentColor,
      totalPaid,
    }
  })

  const filtered = enriched.filter((b: any) => {
    const matchSearch = !search || [b.bookingNumber, b.customerName, b.direction].some((f: string) => f?.toLowerCase().includes(search.toLowerCase()))
    const matchStage = stageFilter === "all" || getCanonicalPipelineStage(b.stage as PipelineStage) === stageFilter
    return matchSearch && matchStage
  })

  const draftEnquiries = data.bookings
    .filter((b: any) => b.source === "paste_import" && b.stage === "enquiry")
    .map((b: any) => {
      const customer = data.customers.find((c: any) => c.id === b.customerId)
      return {
        ...b,
        jobNumber: b.bookingNumber,
        name: customer?.firstName || "",
        surname: customer?.lastName || "",
      }
    })

  return (
    <div className="flex h-full min-h-0 flex-col p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-foreground tracking-tight">Pipeline</h1>
          <p className="text-base text-muted-foreground mt-2">Manage all jobs across pipeline stages</p>
        </div>
        <div className="flex items-center gap-2">
          {can("create:enquiry") && (
            <>
              <Button size="sm" variant="default" onClick={() => setNewEnquiryOpen(true)}>
                <Plus className="w-4 h-4 mr-1.5" /> New Enquiry
              </Button>
              <NewEnquiryDialog
                open={newEnquiryOpen}
                onOpenChange={setNewEnquiryOpen}
                onSaved={(jobId) => router.push(`/app/bookings/${jobId}`)}
              />
            </>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="ghost">
                <Settings className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" align="end">
              <div className="space-y-3">
                <h4 className="font-medium text-sm">Pipeline Settings</h4>
                <div className="flex items-center justify-between">
                  <Label htmlFor="show-all-items" className="text-sm">Show All Items tab</Label>
                  <Switch
                    id="show-all-items"
                    checked={showAllItems}
                    onCheckedChange={toggleShowAllItems}
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <Tabs defaultValue="kanban" className="mt-5 flex min-h-0 flex-1 flex-col w-full">
        <TabsList className={`grid w-full max-w-md ${showAllItems ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {showAllItems && <TabsTrigger value="table">All Items</TabsTrigger>}
          <TabsTrigger value="kanban">Status board</TabsTrigger>
          <TabsTrigger value="drafts">Draft enquiries</TabsTrigger>
        </TabsList>

        <TabsContent value="table" className="mt-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search jobs..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
            </div>
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-44 h-9 text-sm">
                <SelectValue placeholder="Stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                {PIPELINE_STAGES.map(s => (
                  <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            {filtered.map((b: any) => (
              <Link key={b.id} href={`/app/bookings/${b.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${PAYMENT_COLORS[b.paymentColor] || "bg-muted-foreground"}`} title={`Payment: ${PAYMENT_STATUS_LABELS[b.paymentColor] ?? b.paymentColor}`} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">{b.bookingNumber}</span>
                            <span className="text-sm text-muted-foreground">{b.customerName}</span>
                          </div>
                          <p className="text-sm text-muted-foreground truncate mt-1">
                            {b.direction}{b.departureDate ? ` | Dep: ${formatDisplayDate(b.departureDate)}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <Badge variant="outline" className="text-xs">{getPipelineStageLabel(b.stage)}</Badge>
                        <p className="text-xs text-muted-foreground mt-1">{formatDisplayDate(b.updatedAt)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-12 text-sm text-muted-foreground">No bookings found</div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="kanban" className="mt-5 flex min-h-0 flex-1 flex-col">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {can("edit:pipeline") ? "Drag jobs between stages to update their status" : "View-only mode"}
            </div>
            <Select value={consultantFilter} onValueChange={(v) => setConsultantFilter(v as any)}>
              <SelectTrigger className="w-44 h-9 text-sm">
                <SelectValue placeholder="Consultant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Consultants</SelectItem>
                {CONSULTANTS.map(c => (
                  <SelectItem key={c.key} value={c.key}>{c.key} - {c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-h-0 flex-1 overflow-x-auto">
            <div className="flex min-w-max h-full gap-3 pb-4">
              {KANBAN_STAGES.map((stage) => {
                const stageJobs = grouped[stage.key] || []
                const isOver = dragOverStage === stage.key
                const acceptDropStage = stage.includes[0]
                return (
                  <div key={stage.key} className="flex w-64 flex-shrink-0 flex-col h-full">
                    <div
                      className={`flex-shrink-0 flex items-center justify-between rounded-t-lg border-b border-border px-3 py-3 transition-colors ${
                        isOver ? "bg-primary/10" : "bg-secondary"
                      }`}
                    >
                      <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                        {stage.label}
                      </span>
                      <Badge variant="secondary" className="text-xs h-6 min-w-[24px] justify-center font-semibold">
                        {stageJobs.length}
                      </Badge>
                    </div>
                    <div
                      className={`flex-1 min-h-0 overflow-y-auto rounded-b-lg p-2 space-y-2 transition-colors ${
                        isOver ? "bg-primary/10" : "bg-secondary"
                      }`}
                      onDragOver={(e) => handleDragOver(e, stage.key)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, acceptDropStage as PipelineStage)}
                    >
                      {stageJobs.map((job) => (
                        <PipelineCard
                          key={job.id}
                          job={job}
                          isDragging={draggedJob === job.id}
                          canDrag={can("edit:pipeline")}
                          onDragStart={handleDragStart}
                          auditLogs={data.auditLogs || []}
                        />
                      ))}
                      {stageJobs.length === 0 && (
                        <div className="text-center py-8 text-xs text-muted-foreground">
                          No jobs
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="drafts" className="mt-5 space-y-3">
          <p className="text-sm text-muted-foreground">Enquiries imported from pasted emails and text</p>
          <div className="space-y-3">
            {draftEnquiries.map((b: any) => (
              <Link key={b.id} href={`/app/bookings/${b.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <Clipboard className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">{b.bookingNumber}</span>
                            <Badge variant="secondary" className="text-xs">{b.purpose}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground truncate mt-1">
                            {b.name} {b.surname} &middot; {b.direction} &middot; {b.departureDate ? formatDisplayDate(b.departureDate) : ""}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <Badge variant="outline" className="text-xs">{getPipelineStageLabel(b.stage)}</Badge>
                        <p className="text-xs text-muted-foreground mt-1">{formatDisplayDate(b.createdAt)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
            {draftEnquiries.length === 0 && (
              <div className="text-center py-12 text-sm text-muted-foreground">No draft enquiries</div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <StageTransitionModal
        open={transitionModalOpen}
        jobId={pendingJobId || ""}
        jobNumber={(jobs as PipelineJob[]).find((j) => j.id === pendingJobId)?.bookingNumber || ""}
        targetStage={pendingToStage}
        failures={transitionFailures}
        isManager={transitionIsManager}
        submitting={transitionSubmitting}
        onCancel={resetPendingTransition}
        onProceed={async (manualConfirmations) => {
          if (!pendingJobId || !pendingToStage) return
          await moveJob(pendingJobId, pendingToStage, { manualConfirmations })
        }}
        onOverride={async (overrideReason) => {
          if (!pendingJobId || !pendingToStage) return
          await moveJob(pendingJobId, pendingToStage, { overrideReason })
        }}
      />
    </div>
  )
}

function PipelineCard({
  job,
  isDragging,
  canDrag,
  onDragStart,
  auditLogs,
}: {
  job: PipelineJob
  isDragging: boolean
  canDrag: boolean
  onDragStart: (e: React.DragEvent, id: string) => void
  auditLogs: any[]
}) {
  const paymentDotClass = PAYMENT_COLORS[job.paymentColor] || "bg-muted-foreground"
  const showTripCompleteBadge = job.stage === "voucher_sent" && isPastOrToday(job.tripEndDate)
  
  const handleDownloadAudit = async (e: React.MouseEvent, allAuditLogs: any[]) => {
    e.preventDefault()
    e.stopPropagation()
    
    try {
      const jobAuditLogs = allAuditLogs.filter(log => log.entityId === job.id || 
        (log.entityType === 'Booking' && log.entityId === job.id))
      downloadAuditLog(jobAuditLogs, job.bookingNumber)
      toast.success("Audit log downloaded")
    } catch (error) {
      console.error("[v0] Failed to download audit:", error)
      toast.error("Failed to download audit log")
    }
  }

  return (
    <Card
      draggable={canDrag}
      onDragStart={(e) => onDragStart(e, job.id)}
      className={`group transition-all ${isDragging ? "opacity-40 scale-95" : ""} ${
        canDrag ? "cursor-grab active:cursor-grabbing" : ""
      } hover:shadow-sm relative`}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-1 mb-1">
          <Link href={`/app/bookings/${job.id}`} className="text-xs font-bold text-foreground hover:text-primary transition-colors">
            {job.bookingNumber}
          </Link>
          <div className="flex items-center gap-1.5">
            {job.consultant && (
              <Badge variant="default" className="text-[10px] h-4 px-1 font-bold">{job.consultant}</Badge>
            )}
            <div className={`w-2.5 h-2.5 rounded-full ${paymentDotClass}`} title={`Payment: ${PAYMENT_STATUS_LABELS[job.paymentColor] ?? job.paymentColor}`} />
            {canDrag && <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50" />}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 truncate">{job.customerName}</p>
        {job.direction && (
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{job.direction}</p>
        )}
        {job.departureDate && (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Dep: {formatDisplayDate(job.departureDate)}
          </p>
        )}
        {showTripCompleteBadge && (
          <Badge variant={job.thankYouScheduledAt ? "secondary" : "outline"} className="mt-2 gap-1 text-[10px]">
            <CheckCircle2 className="w-3 h-3" />
            {job.thankYouScheduledAt ? "Thank-you scheduled" : "Trip Complete - Follow up"}
          </Badge>
        )}
        <button
          onClick={(e) => handleDownloadAudit(e, auditLogs)}
          className="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-secondary rounded"
          title="Download audit log"
        >
          <Download className="w-3 h-3 text-muted-foreground" />
        </button>
      </CardContent>
    </Card>
  )
}
