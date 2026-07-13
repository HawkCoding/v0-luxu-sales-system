import { safeSupabaseError } from "@/lib/api/responses"
import { NextResponse } from "next/server"
import { z } from "zod"
import { formatDisplayDateTime } from "@/lib/date-format"
import {
  auditListQuerySchema,
  listAuditLogs,
  requireAuditAccess,
} from "@/lib/audit"
import { createSessionClient } from "@/lib/supabase/server"
import type { Database, Json } from "@/lib/supabase/types"

const auditWriteSchema = z.object({
  actor: z.string().trim().min(1).max(160).optional(),
  entityType: z.string().trim().min(1).max(120),
  entityId: z.string().trim().min(1).max(160),
  action: z.string().trim().min(1).max(160),
  beforeJson: z.string().optional(),
  afterJson: z.string().optional(),
  metaJson: z.string().optional(),
})

function parseOptionalJson(value: string | undefined): Json | null {
  if (!value) return null
  return JSON.parse(value) as Json
}

export async function GET(req: Request) {
  const auth = await requireAuditAccess()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const parsed = auditListQuerySchema.safeParse(Object.fromEntries(url.searchParams))

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid audit query", details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    return NextResponse.json(await listAuditLogs(auth.value, parsed.data))
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load audit logs" },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  const supabase = await createSessionClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: z.infer<typeof auditWriteSchema>

  try {
    body = auditWriteSchema.parse(await req.json())
  } catch (error) {
    return NextResponse.json(
      {
        error: "Invalid audit payload",
        details: error instanceof z.ZodError ? error.flatten() : undefined,
      },
      { status: 400 },
    )
  }

  let actorName = user.email ?? body.actor ?? "system"

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, surname")
    .eq("user_id", user.id)
    .maybeSingle()

  const profileName = [profile?.name, profile?.surname].filter(Boolean).join(" ").trim()
  if (profileName) actorName = profileName

  let payload: Database["public"]["Tables"]["audit_logs"]["Insert"]

  try {
    payload = {
      actor: actorName,
      actor_user_id: user.id,
      entity_type: body.entityType,
      entity_id: body.entityId,
      action: body.action,
      before_json: parseOptionalJson(body.beforeJson),
      after_json: parseOptionalJson(body.afterJson),
      meta_json: parseOptionalJson(body.metaJson),
    }
  } catch {
    return NextResponse.json({ error: "Invalid audit JSON fields" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("audit_logs")
    .insert(payload)
    .select("id, actor, entity_type, entity_id, action, created_at")
    .single()

  if (error) return safeSupabaseError("audit", error)

  return NextResponse.json({
    id: data.id,
    actor: data.actor,
    entityType: data.entity_type,
    entityId: data.entity_id,
    action: data.action,
    createdAt: data.created_at,
    createdAtDisplay: formatDisplayDateTime(data.created_at),
  })
}
