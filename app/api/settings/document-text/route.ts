import { z } from "zod"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"
import {
  DOCUMENT_TEXT_SETTING_KEYS,
  getDocumentTextSettings,
  requireManagerSettingsAccess,
} from "@/lib/settings-access"

export async function GET() {
  const auth = await requireManagerSettingsAccess()
  if (!auth.ok) return auth.response

  const settings = await getDocumentTextSettings(auth.value.supabase)
  return Response.json(settings)
}

const patchSchema = z
  .object({
    quote_doc_title: z.string().trim().min(1).max(80).optional(),
    quote_doc_footer_text: z.string().trim().min(1).max(500).optional(),
    voucher_doc_title: z.string().trim().min(1).max(80).optional(),
    invoice_doc_deposit_title: z.string().trim().min(1).max(80).optional(),
    invoice_doc_final_title: z.string().trim().min(1).max(80).optional(),
    invoice_doc_footer_text: z.string().trim().min(1).max(500).optional(),
    itinerary_doc_journey_heading: z.string().trim().min(1).max(80).optional(),
    // Empty string allowed — clearing removes the intro paragraph.
    itinerary_doc_intro_text: z.string().trim().max(500).optional(),
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
    (typeof DOCUMENT_TEXT_SETTING_KEYS)[number],
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

  if (error) return safeSupabaseError("settings-document-text:upsert", error)

  const before = Object.fromEntries(updates.map(([key]) => [key, existing[key] ?? null]))
  const after = Object.fromEntries(updates.map(([key, value]) => [key, value]))

  await writeAuditLog(supabase, {
    actor: auth.value.actorName,
    actorUserId: auth.value.userId,
    entityType: "Settings",
    entityId: "document-text",
    action: "settings_changed",
    before,
    after,
    meta: settingAuditMeta(updates.map(([key]) => key).join(",")),
  })

  return Response.json(after)
}
