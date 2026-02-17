import { NextResponse } from "next/server"
import { getStore, nextId } from "@/lib/store"

export async function GET() {
  return NextResponse.json(getStore().templates)
}

export async function PATCH(req: Request) {
  const body = await req.json()
  const store = getStore()
  const tpl = store.templates.find(t => t.id === body.id)
  if (!tpl) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (body.subject !== undefined) tpl.subject = body.subject
  if (body.bodyHtml !== undefined) tpl.bodyHtml = body.bodyHtml
  if (body.active !== undefined) tpl.active = body.active
  tpl.version += 1

  store.auditLogs.push({
    id: nextId("a"),
    actor: "admin",
    entityType: "Template",
    entityId: tpl.id,
    action: "template_updated",
    afterJson: JSON.stringify({ version: tpl.version }),
    createdAt: new Date().toISOString(),
  })

  return NextResponse.json(tpl)
}
