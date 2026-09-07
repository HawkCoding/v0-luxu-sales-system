import { z } from "zod"
import { requireAnyRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"
import {
  BRAND_BLOCK_POSITIONS,
  getDocumentBrandSettings,
  requireSettingsWrite,
} from "@/lib/settings-access"
import { SUPPLIER_VOCABULARY, type SupplierKind } from "@/lib/types"

const supplierKinds = Object.keys(SUPPLIER_VOCABULARY) as [SupplierKind, ...SupplierKind[]]
const kindSchema = z.enum(supplierKinds)

export async function GET(req?: Request) {
  const auth = await requireAnyRole()
  if (!auth.ok) return auth.response

  const kindRaw = req ? new URL(req.url).searchParams.get("kind") : null
  const kindParsed = kindRaw ? kindSchema.safeParse(kindRaw) : null
  const kind = kindParsed?.success ? kindParsed.data : null

  const settings = await getDocumentBrandSettings(auth.value.supabase, kind)
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

// Only the heading/subheading copy is worth a per-product variant (see
// getDocumentBrandSettings' OVERRIDABLE_BRAND_KEYS) -- positions and the logo are document chrome,
// not wording, so a kind-scoped patch never touches them. No minimum length: empty deletes the
// override row so the kind falls back to the global value.
const kindPatchSchema = z
  .object({
    kind: kindSchema,
    brand_block_heading: z.string().trim().max(80).optional(),
    brand_block_subheading: z.string().trim().max(120).optional(),
  })
  .strict()
  .refine((data) => data.brand_block_heading !== undefined || data.brand_block_subheading !== undefined, {
    message: "At least one field required",
  })

async function patchKindOverride(
  auth: Extract<Awaited<ReturnType<typeof requireSettingsWrite>>, { ok: true }>,
  raw: unknown,
) {
  const parsed = kindPatchSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error, "Invalid input")

  const { kind, ...fields } = parsed.data
  const updates = Object.entries(fields).filter(([, value]) => value !== undefined) as [
    "brand_block_heading" | "brand_block_subheading",
    string,
  ][]

  const { supabase } = auth.value

  const { data: existingRows } = await supabase
    .from("supplier_kind_document_text")
    .select("key, value")
    .eq("kind", kind)
    .in(
      "key",
      updates.map(([key]) => key),
    )
  const existing = Object.fromEntries((existingRows ?? []).map(({ key, value }) => [key, value]))

  const toUpsert = updates.filter(([, value]) => value.length > 0)
  const toDelete = updates.filter(([, value]) => value.length === 0).map(([key]) => key)

  if (toUpsert.length > 0) {
    const { error } = await supabase.from("supplier_kind_document_text").upsert(
      toUpsert.map(([key, value]) => ({ kind, key, value, updated_at: new Date().toISOString() })),
      { onConflict: "kind,key" },
    )
    if (error) return safeSupabaseError("settings-document-brand:upsert-kind", error)
  }

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("supplier_kind_document_text")
      .delete()
      .eq("kind", kind)
      .in("key", toDelete)
    if (error) return safeSupabaseError("settings-document-brand:delete-kind", error)
  }

  const before = Object.fromEntries(updates.map(([key]) => [key, existing[key] ?? null]))
  const after = Object.fromEntries(updates.map(([key, value]) => [key, value || null]))

  await writeAuditLog(supabase, {
    actor: auth.value.actorName,
    actorUserId: auth.value.userId,
    entityType: "Settings",
    entityId: `document-brand:${kind}`,
    action: "settings_changed",
    before,
    after,
    meta: settingAuditMeta(updates.map(([key]) => key).join(",")),
  })

  return Response.json(await getDocumentBrandSettings(supabase, kind))
}

export async function PATCH(req: Request) {
  const auth = await requireSettingsWrite()
  if (!auth.ok) return auth.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  if (raw && typeof raw === "object" && "kind" in raw && (raw as { kind?: unknown }).kind !== undefined) {
    return patchKindOverride(auth, raw)
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
