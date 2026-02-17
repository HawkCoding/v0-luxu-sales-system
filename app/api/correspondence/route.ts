import { NextResponse } from "next/server"
import { getStore, nextId } from "@/lib/store"

export async function POST(req: Request) {
  const body = await req.json()
  const store = getStore()

  const success = Math.random() > 0.1
  const cor = {
    id: nextId("cor"),
    jobId: body.jobId,
    channel: "email" as const,
    subject: body.subject,
    bodyHtml: body.bodyHtml,
    status: success ? ("sent" as const) : ("failed" as const),
    sentAt: success ? new Date().toISOString() : undefined,
    error: success ? undefined : "SMTP connection timeout (mock)",
  }
  store.correspondences.push(cor)

  if (success && body.moveStage) {
    const job = store.jobs.find(j => j.id === body.jobId)
    if (job) {
      const from = job.stage
      job.stage = body.moveStage
      job.updatedAt = new Date().toISOString()
      store.auditLogs.push({
        id: nextId("a"),
        actor: body.actor || "consultant",
        entityType: "Job",
        entityId: body.jobId,
        action: "stage_change",
        beforeJson: JSON.stringify({ stage: from }),
        afterJson: JSON.stringify({ stage: body.moveStage }),
        createdAt: new Date().toISOString(),
      })
    }
  }

  // Schedule follow-up
  if (success) {
    store.correspondences.push({
      id: nextId("cor"),
      jobId: body.jobId,
      channel: "email",
      subject: `Follow-up: ${body.subject}`,
      bodyHtml: "<p>Scheduled follow-up</p>",
      status: "scheduled",
      scheduledAt: new Date(Date.now() + 48 * 3600000).toISOString(),
    })
  }

  return NextResponse.json(cor)
}
