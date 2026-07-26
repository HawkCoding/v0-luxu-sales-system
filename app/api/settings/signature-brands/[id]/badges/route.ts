import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"
import { readPngDimensions, SIGNATURE_ASSET_BUCKET, signatureAssetObjectPath } from "@/lib/assets/signature-assets"
import { signatureBadgeSchema, type SignatureBadge } from "@/lib/email/signature-brands"
import type { createSessionClient } from "@/lib/supabase/server"
import type { Json } from "@/lib/supabase/types"
import { MAX_IMAGE_BYTES, MAX_IMAGE_MB } from "@/lib/upload-limits"

const ADMIN_ROLES = ["admin", "manager"]
const MAX_BADGES = 6

interface RouteParams {
  params: Promise<{ id: string }>
}

async function loadBrand(supabase: Awaited<ReturnType<typeof createSessionClient>>, id: string) {
  return supabase
    .from("signature_brands")
    .select("slug, badges")
    .eq("id", id)
    .maybeSingle()
}

/** Uploads a new badge image (IATA/ASATA-style) and appends it to the brand's badge list, capped at 6. */
export async function POST(req: Request, { params }: RouteParams) {
  const auth = await requireRole(ADMIN_ROLES)
  if (!auth.ok) return auth.response

  const { id } = await params
  const { supabase } = auth.value

  const { data: brand, error: brandError } = await loadBrand(supabase, id)
  if (brandError) return safeSupabaseError("signature-brands/badges:read", brandError)
  if (!brand) return jsonError("Signature brand not found", 404)

  const existingBadges = z.array(signatureBadgeSchema).catch([]).parse(brand.badges)
  if (existingBadges.length >= MAX_BADGES) {
    return jsonError(`Maximum of ${MAX_BADGES} badges allowed`, 409)
  }

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return jsonError("Missing file", 400)

  if (file.size > MAX_IMAGE_BYTES) {
    return jsonError(`File too large. Maximum image size is ${MAX_IMAGE_MB} MB.`, 413)
  }
  if (file.type !== "image/png") return jsonError("Badge uploads must be PNG.", 400)

  const alt = (formData.get("alt") as string | null)?.trim() || "Badge"
  const hrefRaw = (formData.get("href") as string | null)?.trim() || null
  if (hrefRaw && !z.string().url().safeParse(hrefRaw).success) {
    return jsonError("Badge link must be a valid URL", 400)
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const dimensions = readPngDimensions(bytes)
  if (!dimensions) return jsonError("Could not read the PNG's dimensions.", 400)

  const objectPath = signatureAssetObjectPath("badge", brand.slug, bytes)
  const { error: uploadError } = await supabase.storage
    .from(SIGNATURE_ASSET_BUCKET)
    .upload(objectPath, bytes, { contentType: "image/png", upsert: true })
  if (uploadError) return safeSupabaseError("signature-brands/badges:upload", uploadError)

  const {
    data: { publicUrl },
  } = supabase.storage.from(SIGNATURE_ASSET_BUCKET).getPublicUrl(objectPath)

  const newBadge: SignatureBadge = {
    url: publicUrl,
    alt,
    href: hrefRaw,
    width: dimensions.width,
    height: dimensions.height,
  }
  const badges = [...existingBadges, newBadge]

  const { error: persistError } = await supabase
    .from("signature_brands")
    .update({ badges: badges as unknown as Json, updated_at: new Date().toISOString() })
    .eq("id", id)

  if (persistError) return safeSupabaseError("signature-brands/badges:persist", persistError)

  await writeAuditLog(supabase, {
    actor: auth.value.profile.actorName,
    actorUserId: auth.value.user.id,
    entityType: "Settings",
    entityId: "signature-brands",
    action: "settings_changed",
    before: null,
    after: { [id]: { badge_added: newBadge.url } },
    meta: settingAuditMeta("signature_brands_badges"),
  })

  return Response.json({ badges })
}

const patchSchema = z.object({
  badges: z.array(signatureBadgeSchema).max(MAX_BADGES),
})

/** Full replace of the badge list — used for reorder, alt/href edits. */
export async function PATCH(req: Request, { params }: RouteParams) {
  const auth = await requireRole(ADMIN_ROLES)
  if (!auth.ok) return auth.response

  const { id } = await params
  const { supabase } = auth.value

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = patchSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error, "Invalid input")

  const { data, error } = await supabase
    .from("signature_brands")
    .update({ badges: parsed.data.badges as unknown as Json, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("badges")
    .maybeSingle()

  if (error) return safeSupabaseError("signature-brands/badges:update", error)
  if (!data) return jsonError("Signature brand not found", 404)

  return Response.json({ badges: data.badges })
}

const deleteSchema = z.object({ url: z.string().trim().min(1) })

/** Removes one badge by url. */
export async function DELETE(req: Request, { params }: RouteParams) {
  const auth = await requireRole(ADMIN_ROLES)
  if (!auth.ok) return auth.response

  const { id } = await params
  const { supabase } = auth.value

  const url = new URL(req.url).searchParams.get("url")
  const parsed = deleteSchema.safeParse({ url })
  if (!parsed.success) return jsonZodError(parsed.error, "Invalid input")

  const { data: brand, error: brandError } = await loadBrand(supabase, id)
  if (brandError) return safeSupabaseError("signature-brands/badges:read", brandError)
  if (!brand) return jsonError("Signature brand not found", 404)

  const existingBadges = z.array(signatureBadgeSchema).catch([]).parse(brand.badges)
  const badges = existingBadges.filter((badge) => badge.url !== parsed.data.url)

  const { error } = await supabase
    .from("signature_brands")
    .update({ badges: badges as unknown as Json, updated_at: new Date().toISOString() })
    .eq("id", id)

  if (error) return safeSupabaseError("signature-brands/badges:delete", error)

  return Response.json({ badges })
}
