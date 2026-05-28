import { z } from "zod"
import { requireRole, requireUser } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"

export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.value.supabase
    .from("app_settings")
    .select("key, value")

  if (error) return safeSupabaseError("settings-company:list", error)

  const settings = Object.fromEntries((data ?? []).map(({ key, value }) => [key, value]))
  return Response.json(settings)
}

const patchSchema = z.object({
  business_name: z.string().min(1).max(120),
})

export async function PATCH(req: Request) {
  const auth = await requireRole(["admin"])
  if (!auth.ok) return auth.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = patchSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error, "Invalid input")

  const { data: existing } = await auth.value.supabase
    .from("app_settings")
    .select("value")
    .eq("key", "business_name")
    .maybeSingle()

  const { error } = await auth.value.supabase
    .from("app_settings")
    .upsert({
      key: "business_name",
      value: parsed.data.business_name,
      updated_at: new Date().toISOString(),
    })

  if (error) return safeSupabaseError("settings-company:upsert", error)

  await writeAuditLog(auth.value.supabase, {
    actor: auth.value.profile.actorName,
    actorUserId: auth.value.user.id,
    entityType: "Settings",
    entityId: "company",
    action: "settings_changed",
    before: { business_name: existing?.value ?? null },
    after: { business_name: parsed.data.business_name },
    meta: settingAuditMeta("business_name"),
  })

  return Response.json({ business_name: parsed.data.business_name })
}
