import { NextResponse } from "next/server"
import { z } from "zod"
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

  if (error) {
    return NextResponse.json({ error: "Failed to load inbound email rules" }, { status: 500 })
  }

  return NextResponse.json({ rules: (data ?? []).map(mapRule) })
}

export async function POST(request: Request) {
  const auth = await requireAdminSettingsAccess()
  if (!auth.ok) return auth.response

  let parsed: z.infer<typeof ruleSchema>
  try {
    parsed = ruleSchema.parse(await request.json())
  } catch (error) {
    return NextResponse.json({ error: "Invalid request payload", details: error }, { status: 400 })
  }

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

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Failed to create rule" }, { status: 500 })
  }

  await auth.value.supabase.from("audit_logs").insert({
    actor: auth.value.actorName,
    actor_user_id: auth.value.userId,
    entity_type: "InboundEmailRule",
    entity_id: data.id,
    action: "inbound_email_rule_created",
    meta_json: { name: data.name, subject_pattern: data.subject_pattern },
  })

  return NextResponse.json({ rule: mapRule(data) }, { status: 201 })
}
