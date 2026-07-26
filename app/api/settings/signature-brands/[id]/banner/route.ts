import { requireRole } from "@/lib/api/auth"
import { jsonError, safeSupabaseError } from "@/lib/api/responses"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"
import { readPngDimensions, SIGNATURE_ASSET_BUCKET, signatureAssetObjectPath } from "@/lib/assets/signature-assets"
import { MAX_IMAGE_BYTES, MAX_IMAGE_MB } from "@/lib/upload-limits"

const ADMIN_ROLES = ["admin", "manager"]

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * Content-hashed path (lib/assets/signature-assets.ts) instead of a fixed
 * object path: a rebrand never retroactively changes the banner inside an
 * already-sent email, and the returned URL is immutable so no cache-busting
 * query param is needed.
 */
export async function POST(req: Request, { params }: RouteParams) {
  const auth = await requireRole(ADMIN_ROLES)
  if (!auth.ok) return auth.response

  const { id } = await params
  const { supabase } = auth.value

  const { data: brand, error: brandError } = await supabase
    .from("signature_brands")
    .select("slug, banner_url")
    .eq("id", id)
    .maybeSingle()

  if (brandError) return safeSupabaseError("signature-brands/banner:read", brandError)
  if (!brand) return jsonError("Signature brand not found", 404)

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return jsonError("Missing file", 400)

  if (file.size > MAX_IMAGE_BYTES) {
    return jsonError(`File too large. Maximum image size is ${MAX_IMAGE_MB} MB.`, 413)
  }

  // Transparent PNG only — a JPEG logo shows a white box in dark mode.
  if (file.type !== "image/png") {
    return jsonError("Banner uploads must be PNG.", 400)
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const dimensions = readPngDimensions(bytes)
  if (!dimensions) return jsonError("Could not read the PNG's dimensions.", 400)

  const objectPath = signatureAssetObjectPath("banner", brand.slug, bytes)

  const { error: uploadError } = await supabase.storage
    .from(SIGNATURE_ASSET_BUCKET)
    .upload(objectPath, bytes, { contentType: "image/png", upsert: true })

  if (uploadError) return safeSupabaseError("signature-brands/banner:upload", uploadError)

  const {
    data: { publicUrl },
  } = supabase.storage.from(SIGNATURE_ASSET_BUCKET).getPublicUrl(objectPath)

  const { data, error: settingError } = await supabase
    .from("signature_brands")
    .update({
      banner_url: publicUrl,
      banner_width: dimensions.width,
      banner_height: dimensions.height,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("banner_url, banner_width, banner_height")
    .single()

  if (settingError) return safeSupabaseError("signature-brands/banner:persist", settingError)

  await writeAuditLog(supabase, {
    actor: auth.value.profile.actorName,
    actorUserId: auth.value.user.id,
    entityType: "Settings",
    entityId: "signature-brands",
    action: "settings_changed",
    before: { [id]: { banner_url: brand.banner_url } },
    after: { [id]: { banner_url: publicUrl } },
    meta: settingAuditMeta("signature_brands_banner"),
  })

  return Response.json({
    bannerUrl: data.banner_url,
    bannerWidth: data.banner_width,
    bannerHeight: data.banner_height,
  })
}
