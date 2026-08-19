import { z } from "zod"
import { requireAnyRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"
import { getEmailSignatureSettings, requireSettingsWrite } from "@/lib/settings-access"

export async function GET() {
  const auth = await requireAnyRole()
  if (!auth.ok) return auth.response

  const settings = await getEmailSignatureSettings()
  return Response.json(settings)
}

const patchSchema = z
  .object({
    signature_enabled: z.enum(["true", "false"]).optional(),
    signature_company_line: z.string().trim().max(500).optional(),
    signature_registration_line: z.string().trim().max(200).optional(),
    signature_trading_hours: z.string().trim().max(200).optional(),
    signature_divisions_line: z.string().trim().max(200).optional(),
    signature_confidentiality: z.string().trim().max(1000).optional(),
    signature_office_address: z.string().trim().max(300).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "At least one field required",
  })

type SignaturePatchKey = keyof z.infer<typeof patchSchema>

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
    SignaturePatchKey,
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

  if (error) return safeSupabaseError("settings-email-signature:upsert", error)

  const before = Object.fromEntries(updates.map(([key]) => [key, existing[key] ?? null]))
  const after = Object.fromEntries(updates.map(([key, value]) => [key, value]))

  await writeAuditLog(supabase, {
    actor: auth.value.actorName,
    actorUserId: auth.value.userId,
    entityType: "Settings",
    entityId: "email-signature",
    action: "settings_changed",
    before,
    after,
    meta: settingAuditMeta(updates.map(([key]) => key).join(",")),
  })

  return Response.json(after)
}
