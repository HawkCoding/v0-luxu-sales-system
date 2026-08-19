import { NextResponse } from "next/server"
import { z } from "zod"
import { jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { requireSettingsWrite } from "@/lib/settings-access"
import { isValidSubjectPattern, type InboundRuleMatchType } from "@/lib/inbound-email/rules"

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
  const auth = await requireSettingsWrite()
  if (!auth.ok) return auth.response

  const result = patchRuleSchema.safeParse(await request.json())
  if (!result.success) return jsonZodError(result.error, "Invalid request payload")
  const parsed = result.data

  // Either half of (pattern, matchType) can be patched alone, so the pair has to be validated
  // against the stored row -- switching an existing "contains" pattern to "regex" is exactly how a
  // permanently inert rule gets created. See isValidSubjectPattern.
  if (parsed.subjectPattern !== undefined || parsed.matchType !== undefined) {
    const { data: existing, error: existingError } = await auth.value.supabase
      .from("inbound_email_rules")
      .select("subject_pattern, match_type")
      .eq("id", id)
      .maybeSingle()

    if (existingError) return safeSupabaseError("inbound-email-rules:mutate", existingError)
    if (!existing) return NextResponse.json({ error: "Rule not found" }, { status: 404 })

    const effectivePattern = parsed.subjectPattern ?? existing.subject_pattern
    const effectiveMatchType = (parsed.matchType ?? existing.match_type) as InboundRuleMatchType
    if (!isValidSubjectPattern(effectivePattern, effectiveMatchType)) {
      return NextResponse.json(
        { error: "Invalid request payload", details: { subjectPattern: "Not a valid regular expression" } },
        { status: 400 },
      )
    }
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
  const auth = await requireSettingsWrite()
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
