import { NextResponse } from "next/server"
import { z } from "zod"
import { requireAdminSettingsAccess } from "@/lib/settings-access"

const patchRuleSchema = z.object({
  name: z.string().trim().min(1).optional(),
  subjectPattern: z.string().trim().min(1).optional(),
  matchType: z.enum(["contains", "exact", "regex"]).optional(),
  active: z.boolean().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await requireAdminSettingsAccess()
  if (!auth.ok) return auth.response

  let parsed: z.infer<typeof patchRuleSchema>
  try {
    parsed = patchRuleSchema.parse(await request.json())
  } catch (error) {
    return NextResponse.json({ error: "Invalid request payload", details: error }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (parsed.name !== undefined) updates.name = parsed.name
  if (parsed.subjectPattern !== undefined) updates.subject_pattern = parsed.subjectPattern
  if (parsed.matchType !== undefined) updates.match_type = parsed.matchType
  if (parsed.active !== undefined) updates.active = parsed.active

  const { error } = await auth.value.supabase
    .from("inbound_email_rules")
    .update(updates)
    .eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await auth.value.supabase.from("audit_logs").insert({
    actor: auth.value.actorName,
    actor_user_id: auth.value.userId,
    entity_type: "InboundEmailRule",
    entity_id: id,
    action: "inbound_email_rule_updated",
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await requireAdminSettingsAccess()
  if (!auth.ok) return auth.response

  const { error } = await auth.value.supabase
    .from("inbound_email_rules")
    .delete()
    .eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await auth.value.supabase.from("audit_logs").insert({
    actor: auth.value.actorName,
    actor_user_id: auth.value.userId,
    entity_type: "InboundEmailRule",
    entity_id: id,
    action: "inbound_email_rule_deleted",
  })

  return NextResponse.json({ ok: true })
}
