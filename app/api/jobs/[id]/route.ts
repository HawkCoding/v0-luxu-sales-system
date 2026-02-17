import { NextResponse } from "next/server"
import { getStore, nextId } from "@/lib/store"
import type { PipelineStage } from "@/lib/types"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const store = getStore()
  const job = store.jobs.find(j => j.id === id)
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const customer = store.customers.find(c => c.id === job.customerId)
  const enquiry = store.enquiries.find(e => e.jobId === id)
  const itineraries = store.itineraries.filter(i => i.jobId === id)
  const quotes = store.quotes.filter(q => q.jobId === id)
  const payments = store.payments.filter(p => p.jobId === id)
  const documents = store.documents.filter(d => d.jobId === id)
  const correspondence = store.correspondences.filter(c => c.jobId === id)
  const auditLogs = store.auditLogs.filter(a => a.entityId === id || a.entityId === enquiry?.id)

  return NextResponse.json({ job, customer, enquiry, itineraries, quotes, payments, documents, correspondence, auditLogs })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const store = getStore()
  const job = store.jobs.find(j => j.id === id)
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (body.stage) {
    const fromStage = job.stage
    store.pipelineHistories.push({
      id: nextId("ph"),
      jobId: id,
      fromStage,
      toStage: body.stage as PipelineStage,
      movedBy: body.actor || "consultant",
      movedAt: new Date().toISOString(),
    })
    store.auditLogs.push({
      id: nextId("a"),
      actor: body.actor || "consultant",
      entityType: "Job",
      entityId: id,
      action: "stage_change",
      beforeJson: JSON.stringify({ stage: fromStage }),
      afterJson: JSON.stringify({ stage: body.stage }),
      createdAt: new Date().toISOString(),
    })
    job.stage = body.stage
  }

  if (body.ownerUser) job.ownerUser = body.ownerUser
  job.updatedAt = new Date().toISOString()

  return NextResponse.json(job)
}
