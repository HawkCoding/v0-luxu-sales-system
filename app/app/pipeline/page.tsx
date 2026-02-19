"use client"

import { usePipeline, useAllData } from "@/lib/use-data"
import { PIPELINE_STAGES, type PipelineStage } from "@/lib/types"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { useRole } from "@/lib/role-context"
import Link from "next/link"
import { useState } from "react"
import { GripVertical, Search, Clipboard, Plus } from "lucide-react"
import { parseEmailDraft, type ParsedDraft } from "@/lib/import/parseEmailDraft"
import { ReviewImportedDraftModal } from "@/components/review-imported-draft-modal"

interface PipelineJob {
  id: string
  jobNumber: string
  customerName: string
  direction: string
  departureDate: string
  stage: PipelineStage
  paymentColor: string
  totalPaid: number
  quoteTotal: number
}

const PAYMENT_COLORS: Record<string, string> = {
  green: "bg-payment-green",
  yellow: "bg-payment-yellow",
  red: "bg-payment-red",
  purple: "bg-payment-purple",
  blue: "bg-payment-blue",
}

export default function PipelinePage() {
  const { data: jobs, isLoading: loadingJobs, mutate: mutateJobs } = usePipeline()
  const { data, isLoading: loadingAll, mutate: mutateAll } = useAllData()
  const { can } = useRole()
  const [draggedJob, setDraggedJob] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [stageFilter, setStageFilter] = useState("all")
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState("")
  const [pasting, setPasting] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [parsedDraft, setParsedDraft] = useState<ParsedDraft | null>(null)

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

  const handleDrop = async (e: React.DragEvent, toStage: PipelineStage) => {
    e.preventDefault()
    const jobId = e.dataTransfer.getData("text/plain")
    setDraggedJob(null)
    setDragOverStage(null)
    if (!jobId || !can("edit:pipeline")) return

    const job = (jobs as PipelineJob[]).find((j) => j.id === jobId)
    if (!job || job.stage === toStage) return

    await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: toStage }),
    })
    mutateJobs()
  }

  const handlePasteImport = () => {
    if (!pasteText.trim()) return
    
    // Parse the email text
    const parsed = parseEmailDraft(pasteText)
    setParsedDraft(parsed)
    
    // Close paste modal and open review modal
    setPasteOpen(false)
    setReviewOpen(true)
  }

  const handleBackToPaste = () => {
    setReviewOpen(false)
    setPasteOpen(true)
  }

  const handleReviewClose = () => {
    setReviewOpen(false)
    setPasteText("")
    setParsedDraft(null)
  }

  if (loadingJobs || loadingAll || !jobs || !data) {
    return <div className="p-6"><div className="animate-pulse space-y-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-secondary rounded-lg" />)}</div></div>
  }

  const grouped = PIPELINE_STAGES.reduce(
    (acc, stage) => {
      acc[stage.key] = ((jobs as PipelineJob[]) || []).filter((j) => j.stage === stage.key)
      return acc
    },
    {} as Record<string, PipelineJob[]>
  )

  const enriched = data.jobs.map((j: any) => {
    const customer = data.customers.find((c: any) => c.id === j.customerId)
    const enquiry = data.enquiries.find((e: any) => e.jobId === j.id)
    const payments = data.payments.filter((p: any) => p.jobId === j.id)
    const quotes = data.quotes.filter((q: any) => q.jobId === j.id)
    const totalPaid = payments.reduce((s: number, p: any) => s + p.amount, 0)
    const quoteTotal = quotes.reduce((s: number, q: any) => Math.max(s, q.total), 0) || 1
    let paymentColor = "red"
    if (totalPaid < 0) paymentColor = "blue"
    else if (totalPaid >= quoteTotal && totalPaid > 0) paymentColor = "green"
    else if (totalPaid >= quoteTotal * 0.25) paymentColor = "yellow"
    else if (totalPaid > 0) paymentColor = "purple"
    return {
      ...j,
      customerName: customer ? `${customer.firstName} ${customer.lastName}` : "Unknown",
      direction: enquiry?.direction || "",
      departureDate: enquiry?.departureDate || "",
      paymentColor,
      totalPaid,
      source: enquiry?.source || "unknown",
    }
  })

  const filtered = enriched.filter((j: any) => {
    const matchSearch = !search || [j.jobNumber, j.customerName, j.direction].some((f: string) => f?.toLowerCase().includes(search.toLowerCase()))
    const matchStage = stageFilter === "all" || j.stage === stageFilter
    return matchSearch && matchStage
  })

  const draftEnquiries = data.enquiries
    .filter((e: any) => e.source === "paste_import")
    .map((e: any) => {
      const job = data.jobs.find((j: any) => j.id === e.jobId)
      return { ...e, jobNumber: job?.jobNumber, stage: job?.stage }
    })

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-foreground tracking-tight">Pipeline</h1>
          <p className="text-base text-muted-foreground mt-2">Manage all jobs across pipeline stages</p>
        </div>
        {can("create:enquiry") && (
          <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="default">
                <Plus className="w-4 h-4 mr-1.5" /> New Draft
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Paste Email Import</DialogTitle>
                <DialogDescription>Paste an email or enquiry text to create a draft enquiry.</DialogDescription>
              </DialogHeader>
              <Textarea
                placeholder="Paste the email or text content here..."
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={10}
                className="text-sm"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setPasteOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={handlePasteImport} disabled={!pasteText.trim()}>
                  Review & Import
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Tabs defaultValue="table" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="table">All Items</TabsTrigger>
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
          <TabsTrigger value="drafts">Draft Enquiries</TabsTrigger>
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
            {filtered.map((j: any) => (
              <Link key={j.id} href={`/app/jobs/${j.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${PAYMENT_COLORS[j.paymentColor] || "bg-muted-foreground"}`} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">{j.jobNumber}</span>
                            <span className="text-sm text-muted-foreground">{j.customerName}</span>
                          </div>
                          <p className="text-sm text-muted-foreground truncate mt-1">
                            {j.direction}{j.departureDate ? ` | Dep: ${new Date(j.departureDate).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <Badge variant="outline" className="text-xs">{j.stage.replace(/_/g, " ")}</Badge>
                        <p className="text-xs text-muted-foreground mt-1">{new Date(j.updatedAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-12 text-sm text-muted-foreground">No jobs found</div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="kanban" className="mt-5">
          <div className="mb-3 text-sm text-muted-foreground">
            {can("edit:pipeline") ? "Drag jobs between stages to update their status" : "View-only mode"}
          </div>
          <ScrollArea className="w-full">
            <div className="flex gap-3 pb-4 min-h-[500px]">
              {PIPELINE_STAGES.map((stage) => {
                const stageJobs = grouped[stage.key] || []
                const isOver = dragOverStage === stage.key
                return (
                  <div
                    key={stage.key}
                    className={`w-64 flex-shrink-0 flex flex-col rounded-lg transition-colors ${
                      isOver ? "bg-primary/10" : "bg-secondary"
                    }`}
                    onDragOver={(e) => handleDragOver(e, stage.key)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, stage.key)}
                  >
                    <div className="px-3 py-3 flex items-center justify-between border-b border-border">
                      <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                        {stage.label}
                      </span>
                      <Badge variant="secondary" className="text-xs h-6 min-w-[24px] justify-center font-semibold">
                        {stageJobs.length}
                      </Badge>
                    </div>
                    <div className="flex-1 p-2 space-y-2 min-h-[100px]">
                      {stageJobs.map((job) => (
                        <PipelineCard
                          key={job.id}
                          job={job}
                          isDragging={draggedJob === job.id}
                          canDrag={can("edit:pipeline")}
                          onDragStart={handleDragStart}
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
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </TabsContent>

        <TabsContent value="drafts" className="mt-5 space-y-3">
          <p className="text-sm text-muted-foreground">Enquiries imported from pasted emails and text</p>
          <div className="space-y-3">
            {draftEnquiries.map((e: any) => (
              <Link key={e.id} href={`/app/jobs/${e.jobId}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <Clipboard className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">{e.jobNumber}</span>
                            <Badge variant="secondary" className="text-xs">{e.purpose}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground truncate mt-1">
                            {e.title} {e.name} {e.surname} &middot; {e.direction} &middot; {new Date(e.departureDate).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <Badge variant="outline" className="text-xs">{e.stage?.replace(/_/g, " ")}</Badge>
                        <p className="text-xs text-muted-foreground mt-1">{new Date(e.createdAt).toLocaleDateString()}</p>
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

      {/* Review Imported Draft Modal */}
      <ReviewImportedDraftModal
        open={reviewOpen}
        onOpenChange={handleReviewClose}
        parsedDraft={parsedDraft}
        onBack={handleBackToPaste}
      />
    </div>
  )
}

function PipelineCard({
  job,
  isDragging,
  canDrag,
  onDragStart,
}: {
  job: PipelineJob
  isDragging: boolean
  canDrag: boolean
  onDragStart: (e: React.DragEvent, id: string) => void
}) {
  const paymentDotClass = PAYMENT_COLORS[job.paymentColor] || "bg-muted-foreground"

  return (
    <Card
      draggable={canDrag}
      onDragStart={(e) => onDragStart(e, job.id)}
      className={`transition-all ${isDragging ? "opacity-40 scale-95" : ""} ${
        canDrag ? "cursor-grab active:cursor-grabbing" : ""
      } hover:shadow-sm`}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-1">
          <Link href={`/app/jobs/${job.id}`} className="text-xs font-bold text-foreground hover:text-primary transition-colors">
            {job.jobNumber}
          </Link>
          <div className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${paymentDotClass}`} title={`Payment: ${job.paymentColor}`} />
            {canDrag && <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50" />}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 truncate">{job.customerName}</p>
        {job.direction && (
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{job.direction}</p>
        )}
        {job.departureDate && (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Dep: {new Date(job.departureDate).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
