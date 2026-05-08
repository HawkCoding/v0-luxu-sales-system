import { NextResponse } from "next/server"
import { z } from "zod"
import { jsonZodError, safeSupabaseError } from "@/lib/api/responses"
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

  const result = patchRuleSchema.safeParse(await request.json())
  if (!result.success) return jsonZodError(result.error, "Invalid request payload")
  const parsed = result.data

  const updates: Record<string, unknown> = {}
  if (parsed.name !== undefined) updates.name = parsed.name
  if (parsed.subjectPattern !== undefined) updates.subject_pattern = parsed.subjectPattern
  if (parsed.matchType !== undefined) updates.match_type = parsed.matchType
  if (parsed.active !== undefined) updates.active = parsed.active

  const { error } = await auth.value.supabase
    .from("inbound_email_rules")
    .update(updates)
    .eq("id", id)

  if (error) return safeSupabaseError("inbound-email-rules:mutate", error)

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

  if (error) return safeSupabaseError("inbound-email-rules:mutate", error)

  await auth.value.supabase.from("audit_logs").insert({
    actor: auth.value.actorName,
    actor_user_id: auth.value.userId,
    entity_type: "InboundEmailRule",
    entity_id: id,
    action: "inbound_email_rule_deleted",
  })

  return NextResponse.json({ ok: true })
}
