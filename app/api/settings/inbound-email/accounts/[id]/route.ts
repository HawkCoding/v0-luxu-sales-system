import { NextResponse } from "next/server"
import { z } from "zod"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"
import { jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { encryptCredential } from "@/lib/inbound-email/crypto"
import { requireAdminSettingsAccess } from "@/lib/settings-access"

const patchAccountSchema = z.object({
  email: z.string().trim().email().optional(),
  host: z.string().trim().min(1).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  tlsMode: z.enum(["ssl_tls", "starttls", "none"]).optional(),
  username: z.string().trim().min(1).optional(),
  password: z.string().min(1).optional(),
  inboxFolder: z.string().trim().min(1).optional(),
  processedFolder: z.string().trim().min(1).optional(),
  needsReviewFolder: z.string().trim().min(1).optional(),
  enabled: z.boolean().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await requireAdminSettingsAccess()
  if (!auth.ok) return auth.response

  const result = patchAccountSchema.safeParse(await request.json())
  if (!result.success) return jsonZodError(result.error, "Invalid request payload")
  const parsed = result.data

  const updates: Record<string, unknown> = {}
  if (parsed.email !== undefined) updates.email = parsed.email.toLowerCase()
  if (parsed.host !== undefined) updates.host = parsed.host
  if (parsed.port !== undefined) updates.port = parsed.port
  if (parsed.tlsMode !== undefined) updates.tls_mode = parsed.tlsMode
  if (parsed.username !== undefined) updates.username = parsed.username
  if (parsed.password !== undefined) updates.password_encrypted = encryptCredential(parsed.password)
  if (parsed.inboxFolder !== undefined) updates.inbox_folder = parsed.inboxFolder
  if (parsed.processedFolder !== undefined) updates.processed_folder = parsed.processedFolder
  if (parsed.needsReviewFolder !== undefined) updates.needs_review_folder = parsed.needsReviewFolder
  if (parsed.enabled !== undefined) updates.enabled = parsed.enabled

  const { error } = await auth.value.supabase
    .from("inbound_email_accounts")
    .update(updates)
    .eq("id", id)

  if (error) return safeSupabaseError("inbound-email-accounts:mutate", error)

  await auth.value.supabase.from("audit_logs").insert({
    actor: auth.value.actorName,
    actor_user_id: auth.value.userId,
    entity_type: "InboundEmailAccount",
    entity_id: id,
    action: "inbound_email_account_updated",
  })

  const auditResult = await writeAuditLog(auth.value.supabase, {
    actor: auth.value.actorName,
    actorUserId: auth.value.userId,
    entityType: "Settings",
    entityId: "inbound_email_accounts",
    action: "settings_changed",
    after: { account_id: id, changed_fields: Object.keys(updates) },
    meta: { ...settingAuditMeta("inbound_email_accounts"), operation: "update" },
  })
  if (auditResult.error) return safeSupabaseError("inbound-email-accounts:audit-settings", auditResult.error)

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
    .from("inbound_email_accounts")
    .delete()
    .eq("id", id)

  if (error) return safeSupabaseError("inbound-email-accounts:mutate", error)

  await auth.value.supabase.from("audit_logs").insert({
    actor: auth.value.actorName,
    actor_user_id: auth.value.userId,
    entity_type: "InboundEmailAccount",
    entity_id: id,
    action: "inbound_email_account_deleted",
  })

  const auditResult = await writeAuditLog(auth.value.supabase, {
    actor: auth.value.actorName,
    actorUserId: auth.value.userId,
    entityType: "Settings",
    entityId: "inbound_email_accounts",
    action: "settings_changed",
    before: { account_id: id },
    meta: { ...settingAuditMeta("inbound_email_accounts"), operation: "delete" },
  })
  if (auditResult.error) return safeSupabaseError("inbound-email-accounts:audit-settings", auditResult.error)

  return NextResponse.json({ ok: true })
}
