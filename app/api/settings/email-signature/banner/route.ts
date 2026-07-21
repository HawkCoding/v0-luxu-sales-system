import { safeSupabaseError } from "@/lib/api/responses"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"
import { FOOTER_BRAND_BUCKET } from "@/lib/assets/footer-brand"
import { requireAdminSettingsAccess } from "@/lib/settings-access"
import { MAX_IMAGE_BYTES, MAX_IMAGE_MB } from "@/lib/upload-limits"

const BANNER_SETTING_KEY = "signature_banner_url"
const BANNER_OBJECT_PATH = "brand/sarail-signature-banner.png"

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg"])

// Uploads into the same public bucket the footer logo mirrors into, so both
// assets resolve to an absolute URL every mail client can load.
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

  if (!ALLOWED_TYPES.has(file.type)) {
    return Response.json({ error: "Banner uploads must be PNG or JPEG." }, { status: 400 })
  }

  const buffer = new Uint8Array(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from(FOOTER_BRAND_BUCKET)
    .upload(BANNER_OBJECT_PATH, buffer, { contentType: file.type, upsert: true })

  if (uploadError) {
    return safeSupabaseError("settings-email-signature-banner:upload", uploadError)
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(FOOTER_BRAND_BUCKET).getPublicUrl(BANNER_OBJECT_PATH)

  // Cache-bust so a replacement banner is fetched fresh by browsers.
  const url = `${publicUrl}?t=${Date.now()}`

  const { data: previous } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", BANNER_SETTING_KEY)
    .maybeSingle()

  const { error: settingError } = await supabase
    .from("app_settings")
    .upsert({ key: BANNER_SETTING_KEY, value: url, updated_at: new Date().toISOString() })

  if (settingError) {
    return safeSupabaseError("settings-email-signature-banner:persist", settingError)
  }

  await writeAuditLog(supabase, {
    actor: auth.value.actorName,
    actorUserId: auth.value.userId,
    entityType: "Settings",
    entityId: "email-signature",
    action: "settings_changed",
    before: { [BANNER_SETTING_KEY]: previous?.value ?? null },
    after: { [BANNER_SETTING_KEY]: url },
    meta: settingAuditMeta(BANNER_SETTING_KEY),
  })

  return Response.json({ url })
}
