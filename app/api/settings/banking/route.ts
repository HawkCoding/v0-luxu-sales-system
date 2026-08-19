import { z } from "zod"
import { requireAnyRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"
import {
  BANKING_SETTING_KEYS,
  getBankingSettings,
  requireSettingsWrite,
} from "@/lib/settings-access"

export async function GET() {
  const auth = await requireAnyRole()
  if (!auth.ok) return auth.response

  const settings = await getBankingSettings(auth.value.supabase)
  return Response.json(settings)
}

// Empty strings are allowed so a value can be cleared.
const fieldSchema = z.string().trim().max(300).optional()

const patchSchema = z
  .object(Object.fromEntries(BANKING_SETTING_KEYS.map((key) => [key, fieldSchema])))
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "At least one field required",
  })

export async function PATCH(req: Request) {
  const auth = await requireSettingsWrite()
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
    (typeof BANKING_SETTING_KEYS)[number],
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

  if (error) return safeSupabaseError("settings-banking:upsert", error)

  const before = Object.fromEntries(updates.map(([key]) => [key, existing[key] ?? null]))
  const after = Object.fromEntries(updates.map(([key, value]) => [key, value]))

  await writeAuditLog(supabase, {
    actor: auth.value.actorName,
    actorUserId: auth.value.userId,
    entityType: "Settings",
    entityId: "banking",
    action: "settings_changed",
    before,
    after,
    meta: settingAuditMeta(updates.map(([key]) => key).join(",")),
  })

  return Response.json(after)
}
