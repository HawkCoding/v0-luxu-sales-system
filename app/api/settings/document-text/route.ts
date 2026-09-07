import { z } from "zod"
import { requireAnyRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"
import {
  DOCUMENT_TEXT_SETTING_KEYS,
  getDocumentTextSettings,
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

  const settings = await getDocumentTextSettings(auth.value.supabase, kind)
  return Response.json(settings)
}

const patchSchema = z
  .object({
    quote_doc_title: z.string().trim().min(1).max(80).optional(),
    quote_doc_footer_text: z.string().trim().min(1).max(500).optional(),
    quote_doc_includes_heading: z.string().trim().min(1).max(80).optional(),
    quote_doc_excludes_heading: z.string().trim().min(1).max(80).optional(),
    // Empty string allowed — clearing removes the standing exclusion line.
    quote_doc_excludes_default: z.string().trim().max(500).optional(),
    voucher_doc_title: z.string().trim().min(1).max(80).optional(),
    invoice_doc_deposit_title: z.string().trim().min(1).max(80).optional(),
    invoice_doc_final_title: z.string().trim().min(1).max(80).optional(),
    invoice_doc_footer_text: z.string().trim().min(1).max(500).optional(),
    // Empty string allowed — clearing removes the note from the invoice.
    invoice_doc_payment_note: z.string().trim().max(500).optional(),
    invoice_doc_bank_charges_note: z.string().trim().max(500).optional(),
    itinerary_doc_journey_heading: z.string().trim().min(1).max(80).optional(),
    // Empty string allowed — clearing removes the intro paragraph.
    itinerary_doc_intro_text: z.string().trim().max(500).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "At least one field required",
  })

// Per-kind overrides never require a minimum length: an empty value here does not blank the
// document, it deletes the override row so the kind falls back to the global (or code-vocabulary)
// value -- see patchKindOverride below and getDocumentTextSettings' overlay.
const kindPatchSchema = z
  .object({
    kind: kindSchema,
    quote_doc_title: z.string().trim().max(80).optional(),
    quote_doc_footer_text: z.string().trim().max(500).optional(),
    quote_doc_includes_heading: z.string().trim().max(80).optional(),
    quote_doc_excludes_heading: z.string().trim().max(80).optional(),
    quote_doc_excludes_default: z.string().trim().max(500).optional(),
    voucher_doc_title: z.string().trim().max(80).optional(),
    invoice_doc_deposit_title: z.string().trim().max(80).optional(),
    invoice_doc_final_title: z.string().trim().max(80).optional(),
    invoice_doc_footer_text: z.string().trim().max(500).optional(),
    invoice_doc_payment_note: z.string().trim().max(500).optional(),
    invoice_doc_bank_charges_note: z.string().trim().max(500).optional(),
    itinerary_doc_journey_heading: z.string().trim().max(80).optional(),
    itinerary_doc_intro_text: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).some((key) => key !== "kind" && data[key as keyof typeof data] !== undefined), {
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
    (typeof DOCUMENT_TEXT_SETTING_KEYS)[number],
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
    if (error) return safeSupabaseError("settings-document-text:upsert-kind", error)
  }

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("supplier_kind_document_text")
      .delete()
      .eq("kind", kind)
      .in("key", toDelete)
    if (error) return safeSupabaseError("settings-document-text:delete-kind", error)
  }

  const before = Object.fromEntries(updates.map(([key]) => [key, existing[key] ?? null]))
  const after = Object.fromEntries(updates.map(([key, value]) => [key, value || null]))

  await writeAuditLog(supabase, {
    actor: auth.value.actorName,
    actorUserId: auth.value.userId,
    entityType: "Settings",
    entityId: `document-text:${kind}`,
    action: "settings_changed",
    before,
    after,
    meta: settingAuditMeta(updates.map(([key]) => key).join(",")),
  })

  // The resolved (overlay) view, not the raw override rows — the editor's per-kind tab shows what
  // is actually in effect, including a field that just fell back after a delete.
  return Response.json(await getDocumentTextSettings(supabase, kind))
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
