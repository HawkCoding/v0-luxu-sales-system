"use client"

import { usePipeline } from "@/lib/use-data"
import { PIPELINE_STAGES, type PipelineStage } from "@/lib/types"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { useRole } from "@/lib/role-context"
import Link from "next/link"
import { useState } from "react"
import { GripVertical } from "lucide-react"

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
  const { data: jobs, isLoading, mutate } = usePipeline()
  const { can } = useRole()
  const [draggedJob, setDraggedJob] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)

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
    mutate()
  }

  if (isLoading || !jobs) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-secondary rounded" />
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="w-64 h-96 bg-secondary rounded-lg flex-shrink-0" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  const grouped = PIPELINE_STAGES.reduce(
    (acc, stage) => {
      acc[stage.key] = ((jobs as PipelineJob[]) || []).filter((j) => j.stage === stage.key)
      return acc
    },
    {} as Record<string, PipelineJob[]>
  )

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Pipeline</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {can("edit:pipeline") ? "Drag jobs between stages to update their status" : "View-only mode"}
        </p>
      </div>

      <ScrollArea className="flex-1 w-full">
        <div className="flex gap-3 pb-4 min-h-[500px]">
          {PIPELINE_STAGES.map((stage) => {
            const stageJobs = grouped[stage.key] || []
            const isOver = dragOverStage === stage.key
            return (
              <div
                key={stage.key}
                className={`w-60 flex-shrink-0 flex flex-col rounded-lg transition-colors ${
                  isOver ? "bg-brand-gold/10" : "bg-secondary/50"
                }`}
                onDragOver={(e) => handleDragOver(e, stage.key)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stage.key)}
              >
                <div className="px-3 py-2.5 flex items-center justify-between border-b border-border">
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wider" style={{ fontFamily: "var(--font-inter)" }}>
                    {stage.label}
                  </span>
                  <Badge variant="secondary" className="text-[10px] h-5 min-w-[20px] justify-center">
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
                    <div className="text-center py-6 text-xs text-muted-foreground">
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
          <Link href={`/app/jobs/${job.id}`} className="text-xs font-semibold text-foreground hover:text-brand-gold transition-colors" style={{ fontFamily: "var(--font-inter)" }}>
            {job.jobNumber}
          </Link>
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${paymentDotClass}`} title={`Payment: ${job.paymentColor}`} />
            {canDrag && <GripVertical className="w-3 h-3 text-muted-foreground/50" />}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1 truncate">{job.customerName}</p>
        {job.direction && (
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{job.direction}</p>
        )}
        {job.departureDate && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Dep: {new Date(job.departureDate).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
