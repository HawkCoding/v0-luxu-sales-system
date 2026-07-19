import { safeSupabaseError } from "@/lib/api/responses"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"
import {
  FOOTER_BRAND_BUCKET,
  FOOTER_BRAND_OBJECT_PATH,
} from "@/lib/assets/footer-brand"
import { requireAdminSettingsAccess } from "@/lib/settings-access"
import { MAX_IMAGE_BYTES, MAX_IMAGE_MB } from "@/lib/upload-limits"

const LOGO_SETTING_KEY = "brand_block_logo_url"

// The upload converges on the same bucket object the committed asset is mirrored
// to, so the disk copy and an uploaded copy never diverge in location.
export async function POST(req: Request) {
  const auth = await requireAdminSettingsAccess()
  if (!auth.ok) return auth.response

  const { supabase } = auth.value

  const formData = await req.formData()
  const file = formData.get("file") as File | null

  if (!file) {
    return Response.json({ error: "Missing file" }, { status: 400 })
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return Response.json(
      { error: `File too large. Maximum image size is ${MAX_IMAGE_MB} MB.` },
      { status: 413 },
    )
  }

  // The editor crops to PNG before upload; enforce it so react-pdf and the email
  // clients get the format the renderers assume.
  if (file.type !== "image/png") {
    return Response.json({ error: "Logo uploads must be cropped to PNG." }, { status: 400 })
  }

  const buffer = new Uint8Array(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from(FOOTER_BRAND_BUCKET)
    .upload(FOOTER_BRAND_OBJECT_PATH, buffer, { contentType: "image/png", upsert: true })

  if (uploadError) {
    return safeSupabaseError("settings-brand-logo:upload", uploadError)
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(FOOTER_BRAND_BUCKET).getPublicUrl(FOOTER_BRAND_OBJECT_PATH)

  // Cache-bust so a replacement logo is fetched fresh by browsers and the PDF
  // logo cache (which keys on the full URL).
  const url = `${publicUrl}?t=${Date.now()}`

  const { data: previous } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", LOGO_SETTING_KEY)
    .maybeSingle()

  const { error: settingError } = await supabase
    .from("app_settings")
    .upsert({ key: LOGO_SETTING_KEY, value: url, updated_at: new Date().toISOString() })

  if (settingError) {
    return safeSupabaseError("settings-brand-logo:persist", settingError)
  }

  await writeAuditLog(supabase, {
    actor: auth.value.actorName,
    actorUserId: auth.value.userId,
    entityType: "Settings",
    entityId: "document-brand",
    action: "settings_changed",
    before: { [LOGO_SETTING_KEY]: previous?.value ?? null },
    after: { [LOGO_SETTING_KEY]: url },
    meta: settingAuditMeta(LOGO_SETTING_KEY),
  })

  return Response.json({ url })
}
