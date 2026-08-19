import { z } from "zod"
import { requireAnyRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"
import {
  BRAND_BLOCK_POSITIONS,
  getDocumentBrandSettings,
  requireSettingsWrite,
} from "@/lib/settings-access"

export async function GET() {
  const auth = await requireAnyRole()
  if (!auth.ok) return auth.response

  const settings = await getDocumentBrandSettings(auth.value.supabase)
  return Response.json(settings)
}

// The logo URL is written by the upload route, not here, so it is intentionally
// absent from this schema.
const patchSchema = z
  .object({
    brand_block_heading: z.string().trim().min(1).max(80).optional(),
    brand_block_subheading: z.string().trim().min(1).max(120).optional(),
    brand_block_position_quote: z.enum(BRAND_BLOCK_POSITIONS).optional(),
    brand_block_position_invoice: z.enum(BRAND_BLOCK_POSITIONS).optional(),
    brand_block_position_email: z.enum(BRAND_BLOCK_POSITIONS).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "At least one field required",
  })

type BrandPatchKey = keyof z.infer<typeof patchSchema>

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
    BrandPatchKey,
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

  if (error) return safeSupabaseError("settings-document-brand:upsert", error)

  const before = Object.fromEntries(updates.map(([key]) => [key, existing[key] ?? null]))
  const after = Object.fromEntries(updates.map(([key, value]) => [key, value]))

  await writeAuditLog(supabase, {
    actor: auth.value.actorName,
    actorUserId: auth.value.userId,
    entityType: "Settings",
    entityId: "document-brand",
    action: "settings_changed",
    before,
    after,
    meta: settingAuditMeta(updates.map(([key]) => key).join(",")),
  })

  return Response.json(after)
}
