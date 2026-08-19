import { z } from "zod"
import { requireRole, requireUser } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"
import { SETTINGS_WRITE_ROLES } from "@/lib/permissions"

// app_logo_url is read-only here — it's written by /api/settings/app-logo,
// which owns validation and storage for the upload. Included in GET so the
// sidebar's existing useSWR("/api/settings/company") picks it up for free.
const SETTING_KEYS = [
  "business_name",
  "company_email",
  "company_phone",
  "vat_rate",
  "app_logo_url",
] as const

export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.value.supabase
    .from("app_settings")
    .select("key, value")
    .in("key", SETTING_KEYS)

  if (error) return safeSupabaseError("settings-company:list", error)

  const settings = Object.fromEntries((data ?? []).map(({ key, value }) => [key, value]))
  return Response.json(settings)
}

const patchSchema = z
  .object({
    business_name: z.string().min(1).max(120).optional(),
    company_email: z.string().trim().email().max(160).optional(),
    company_phone: z.string().trim().min(1).max(40).optional(),
    vat_rate: z.coerce.number().min(0).max(100).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "At least one field required",
  })

export async function PATCH(req: Request) {
  const auth = await requireRole(SETTINGS_WRITE_ROLES)
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
    (typeof SETTING_KEYS)[number],
    string | number,
  ][]

  const { data: existingRows } = await auth.value.supabase
    .from("app_settings")
    .select("key, value")
    .in(
      "key",
      updates.map(([key]) => key)
    )

  const existing = Object.fromEntries((existingRows ?? []).map(({ key, value }) => [key, value]))

  const { error } = await auth.value.supabase.from("app_settings").upsert(
    updates.map(([key, value]) => ({
      key,
      value: String(value),
      updated_at: new Date().toISOString(),
    }))
  )

  if (error) return safeSupabaseError("settings-company:upsert", error)

  const before = Object.fromEntries(updates.map(([key]) => [key, existing[key] ?? null]))
  const after = Object.fromEntries(updates.map(([key, value]) => [key, String(value)]))

  await writeAuditLog(auth.value.supabase, {
    actor: auth.value.profile.actorName,
    actorUserId: auth.value.user.id,
    entityType: "Settings",
    entityId: "company",
    action: "settings_changed",
    before,
    after,
    meta: settingAuditMeta(updates.map(([key]) => key).join(",")),
  })

  return Response.json(after)
}
