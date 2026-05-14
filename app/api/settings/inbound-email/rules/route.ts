import { NextResponse } from "next/server"
import { z } from "zod"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"
import { jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { requireAdminSettingsAccess } from "@/lib/settings-access"

const ruleSchema = z.object({
  name: z.string().trim().min(1),
  subjectPattern: z.string().trim().min(1),
  matchType: z.enum(["contains", "exact", "regex"]).default("contains"),
  active: z.boolean().default(true),
})

function mapRule(row: {
  id: string
  name: string
  subject_pattern: string
  match_type: string
  active: boolean
  created_at: string
  updated_at: string
}) {
  return {
    id: row.id,
    name: row.name,
    subjectPattern: row.subject_pattern,
    matchType: row.match_type,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function GET() {
  const auth = await requireAdminSettingsAccess()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.value.supabase
    .from("inbound_email_rules")
    .select("id, name, subject_pattern, match_type, active, created_at, updated_at")
    .order("created_at", { ascending: false })

  if (error) return safeSupabaseError("inbound-email-rules:list", error, "Failed to load inbound email rules")

  return NextResponse.json({ rules: (data ?? []).map(mapRule) })
}

export async function POST(request: Request) {
  const auth = await requireAdminSettingsAccess()
  if (!auth.ok) return auth.response

  const result = ruleSchema.safeParse(await request.json())
  if (!result.success) return jsonZodError(result.error, "Invalid request payload")
  const parsed = result.data

  const { data, error } = await auth.value.supabase
    .from("inbound_email_rules")
    .insert({
      name: parsed.name,
      subject_pattern: parsed.subjectPattern,
      match_type: parsed.matchType,
      active: parsed.active,
    })
    .select("id, name, subject_pattern, match_type, active, created_at, updated_at")
    .single()

  if (error || !data) return safeSupabaseError("inbound-email-rules:create", error, "Failed to create rule")

  await auth.value.supabase.from("audit_logs").insert({
    actor: auth.value.actorName,
    actor_user_id: auth.value.userId,
    entity_type: "InboundEmailRule",
    entity_id: data.id,
    action: "inbound_email_rule_created",
    meta_json: { name: data.name, subject_pattern: data.subject_pattern },
  })

  const auditResult = await writeAuditLog(auth.value.supabase, {
    actor: auth.value.actorName,
    actorUserId: auth.value.userId,
    entityType: "Settings",
    entityId: "inbound_email_rules",
    action: "settings_changed",
    after: { rule_id: data.id, name: data.name, subject_pattern: data.subject_pattern },
    meta: { ...settingAuditMeta("inbound_email_rules"), operation: "create" },
  })
  if (auditResult.error) return safeSupabaseError("inbound-email-rules:audit-settings", auditResult.error)

  return NextResponse.json({ rule: mapRule(data) }, { status: 201 })
}
