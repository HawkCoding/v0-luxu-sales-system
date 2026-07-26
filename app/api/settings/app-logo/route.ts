import { safeSupabaseError } from "@/lib/api/responses"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"
import {
  APP_LOGO_BUCKET,
  APP_LOGO_OBJECT_PATH,
  APP_LOGO_SETTING_KEY,
} from "@/lib/branding/app-logo"
import { requireAdminSettingsAccess } from "@/lib/settings-access"
import { MAX_IMAGE_BYTES, MAX_IMAGE_MB } from "@/lib/upload-limits"

// Mirrors app/api/settings/brand-logo/route.ts — same bucket, same shape,
// different setting key and object path. This logo drives the app shell
// (sidebar, favicon, login screen), not client-facing PDFs/emails.
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

  if (file.type !== "image/png") {
    return Response.json({ error: "Logo uploads must be a PNG image." }, { status: 400 })
  }

  const buffer = new Uint8Array(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from(APP_LOGO_BUCKET)
    .upload(APP_LOGO_OBJECT_PATH, buffer, { contentType: "image/png", upsert: true })

  if (uploadError) {
    return safeSupabaseError("settings-app-logo:upload", uploadError)
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(APP_LOGO_BUCKET).getPublicUrl(APP_LOGO_OBJECT_PATH)

  // Cache-bust so the sidebar, favicon and login screen fetch the replacement
  // rather than a browser-cached copy of the old file at the same path.
  const url = `${publicUrl}?t=${Date.now()}`

  const { data: previous } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", APP_LOGO_SETTING_KEY)
    .maybeSingle()

  const { error: settingError } = await supabase
    .from("app_settings")
    .upsert({ key: APP_LOGO_SETTING_KEY, value: url, updated_at: new Date().toISOString() })

  if (settingError) {
    return safeSupabaseError("settings-app-logo:persist", settingError)
  }

  await writeAuditLog(supabase, {
    actor: auth.value.actorName,
    actorUserId: auth.value.userId,
    entityType: "Settings",
    entityId: "company",
    action: "settings_changed",
    before: { [APP_LOGO_SETTING_KEY]: previous?.value ?? null },
    after: { [APP_LOGO_SETTING_KEY]: url },
    meta: settingAuditMeta(APP_LOGO_SETTING_KEY),
  })

  return Response.json({ url })
}

// Reverts to the company-name text fallback used by the sidebar, favicon and
// login screen when no logo is uploaded.
export async function DELETE() {
  const auth = await requireAdminSettingsAccess()
  if (!auth.ok) return auth.response

  const { supabase } = auth.value

  const { data: previous } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", APP_LOGO_SETTING_KEY)
    .maybeSingle()

  const { error: settingError } = await supabase
    .from("app_settings")
    .upsert({ key: APP_LOGO_SETTING_KEY, value: "", updated_at: new Date().toISOString() })

  if (settingError) {
    return safeSupabaseError("settings-app-logo:clear", settingError)
  }

  await writeAuditLog(supabase, {
    actor: auth.value.actorName,
    actorUserId: auth.value.userId,
    entityType: "Settings",
    entityId: "company",
    action: "settings_changed",
    before: { [APP_LOGO_SETTING_KEY]: previous?.value ?? null },
    after: { [APP_LOGO_SETTING_KEY]: "" },
    meta: settingAuditMeta(APP_LOGO_SETTING_KEY),
  })

  return Response.json({ url: null })
}
