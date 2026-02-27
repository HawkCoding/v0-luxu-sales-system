import { NextResponse } from "next/server"
import { createSessionClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createSessionClient()

  const { data: templates } = await supabase
    .from("templates")
    .select("*")
    .order("key", { ascending: true })

  return NextResponse.json(
    (templates ?? []).map((t) => ({
      id: t.id,
      key: t.key,
      subject: t.subject,
      bodyHtml: t.body_html,
      version: t.version,
      active: t.active,
    }))
  )
}

export async function PATCH(req: Request) {
  const body = await req.json()
  const supabase = await createSessionClient()

  const { data: existing } = await supabase
    .from("templates")
    .select("version")
    .eq("id", body.id)
    .single()

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.subject !== undefined) updates.subject = body.subject
  if (body.bodyHtml !== undefined) updates.body_html = body.bodyHtml
  if (body.active !== undefined) updates.active = body.active
  updates.version = existing.version + 1

  const { data: updated, error } = await supabase
    .from("templates")
    .update(updates)
    .eq("id", body.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from("audit_logs").insert({
    actor: "admin",
    entity_type: "Template",
    entity_id: body.id,
    action: "template_updated",
    after_json: { version: updated.version },
  })

  return NextResponse.json({
    id: updated.id,
    key: updated.key,
    subject: updated.subject,
    bodyHtml: updated.body_html,
    version: updated.version,
    active: updated.active,
  })
}
