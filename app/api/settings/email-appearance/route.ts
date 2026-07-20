import { z } from "zod"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"
import {
  EMAIL_APPEARANCE_SETTING_KEYS,
  EMAIL_FONT_FAMILY_OPTIONS,
  EMAIL_FONT_SIZE_OPTIONS,
} from "@/lib/email/appearance"
import { getEmailAppearanceSettings, requireManagerSettingsAccess } from "@/lib/settings-access"

export async function GET() {
  const auth = await requireManagerSettingsAccess()
  if (!auth.ok) return auth.response

  const settings = await getEmailAppearanceSettings(auth.value.supabase)
  return Response.json(settings)
}

// Enums, not free text: both values are interpolated into a <style> block in
// every outgoing email.
const patchSchema = z
  .object({
    email_font_family: z.enum(EMAIL_FONT_FAMILY_OPTIONS).optional(),
    email_font_size: z.enum(EMAIL_FONT_SIZE_OPTIONS).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "At least one field required",
  })

export async function PATCH(req: Request) {
  const auth = await requireManagerSettingsAccess()
  if (!auth.ok) return auth.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = patchSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error, "Invalid input")

  const updates = Object.entries(parsed.data).filter(([, value]) => value !== undefined) as [
    (typeof EMAIL_APPEARANCE_SETTING_KEYS)[number],
    string,
  ][]

  const { supabase } = auth.value

  const { data: existingRows } = await supabase
    .from("app_settings")
    .select("key, value")
    .in(
      "key",
      updates.map(([key]) => key),
    )

  const existing = Object.fromEntries((existingRows ?? []).map(({ key, value }) => [key, value]))

  const { error } = await supabase.from("app_settings").upsert(
    updates.map(([key, value]) => ({
      key,
      value,
      updated_at: new Date().toISOString(),
    })),
  )

  if (error) return safeSupabaseError("settings-email-appearance:upsert", error)

  const before = Object.fromEntries(updates.map(([key]) => [key, existing[key] ?? null]))
  const after = Object.fromEntries(updates.map(([key, value]) => [key, value]))

  await writeAuditLog(supabase, {
    actor: auth.value.actorName,
    actorUserId: auth.value.userId,
    entityType: "Settings",
    entityId: "email-appearance",
    action: "settings_changed",
    before,
    after,
    meta: settingAuditMeta(updates.map(([key]) => key).join(",")),
  })

  return Response.json(after)
}
