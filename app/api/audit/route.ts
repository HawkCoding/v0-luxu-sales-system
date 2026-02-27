import { NextResponse } from "next/server"
import { createSessionClient } from "@/lib/supabase/server"

export async function POST(req: Request) {
  const body = await req.json()
  const supabase = await createSessionClient()

  const { data, error } = await supabase
    .from("audit_logs")
    .insert({
      actor: body.actor || "system",
      entity_type: body.entityType,
      entity_id: body.entityId,
      action: body.action,
      before_json: body.beforeJson ? JSON.parse(body.beforeJson) : null,
      after_json: body.afterJson ? JSON.parse(body.afterJson) : null,
      meta_json: body.metaJson ? JSON.parse(body.metaJson) : null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    id: data.id,
    actor: data.actor,
    entityType: data.entity_type,
    entityId: data.entity_id,
    action: data.action,
    createdAt: data.created_at,
  })
}
