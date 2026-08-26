import { z } from "zod"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { writeAuditLog } from "@/lib/audit-write"
import { requireSettingsWrite } from "@/lib/settings-access"
import {
  ATTACHMENTS_BUCKET,
  EMAIL_ATTACHMENT_KIND_VALUES,
  EMAIL_ATTACHMENT_SUPPLIER_KINDS,
} from "@/lib/attachments/email-attachment-library"

export const runtime = "nodejs"

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    supplierId: z.string().uuid().nullable().optional(),
    supplierKind: z
      .enum(EMAIL_ATTACHMENT_SUPPLIER_KINDS as unknown as [string, ...string[]])
      .nullable()
      .optional(),
    routeId: z.string().uuid().nullable().optional(),
    emailKinds: z
      .array(z.enum(EMAIL_ATTACHMENT_KIND_VALUES as [string, ...string[]]))
      .max(10)
      .optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.supplierId !== undefined ||
      value.supplierKind !== undefined ||
      value.routeId !== undefined ||
      value.emailKinds !== undefined,
    { message: "No fields to update" },
  )
  .refine((value) => !(value.supplierId && value.supplierKind), {
    message: "A file can be scoped to a supplier or a category, not both",
  })
  .refine((value) => !(value.routeId && value.supplierKind), {
    message: "A route can only be set alongside a supplier, not a category",
  })

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSettingsWrite()
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return jsonError("Invalid id", 400)

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = patchSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)

  const { supabase } = auth.value

  const { data: current, error: currentError } = await supabase
    .from("email_attachment_library")
    .select("supplier_id, route_id")
    .eq("id", id)
    .maybeSingle()
  if (currentError) return safeSupabaseError("email-attachments:current", currentError)
  if (!current) return jsonError("Attachment not found", 404)

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (parsed.data.name !== undefined) updates.name = parsed.data.name
  if (parsed.data.emailKinds !== undefined) updates.email_kinds = parsed.data.emailKinds
  // Scope is mutually exclusive: setting a supplier clears the category and
  // vice-versa, so the DB scope-exclusivity constraint always holds.
  if (parsed.data.supplierId !== undefined) {
    updates.supplier_id = parsed.data.supplierId
    if (parsed.data.supplierId) updates.supplier_kind = null
  }
  if (parsed.data.supplierKind !== undefined) {
    updates.supplier_kind = parsed.data.supplierKind
    if (parsed.data.supplierKind) {
      updates.supplier_id = null
      updates.route_id = null
    }
  }

  // route_id is a refinement of supplier_id: an explicit routeId wins, otherwise a supplier
  // change drops the old route (it belonged to the previous supplier) rather than orphaning it.
  if (parsed.data.routeId !== undefined) {
    updates.route_id = parsed.data.routeId
  } else if (
    parsed.data.supplierId !== undefined &&
    parsed.data.supplierId !== current.supplier_id &&
    updates.route_id === undefined
  ) {
    updates.route_id = null
  }

  const effectiveSupplierId =
    parsed.data.supplierId !== undefined ? parsed.data.supplierId : current.supplier_id
  const effectiveRouteId =
    updates.route_id !== undefined ? (updates.route_id as string | null) : current.route_id

  if (effectiveRouteId) {
    if (!effectiveSupplierId) {
      return jsonError("A route can only be set alongside a supplier", 400)
    }
    const { data: route, error: routeError } = await supabase
      .from("routes")
      .select("supplier_id")
      .eq("id", effectiveRouteId)
      .maybeSingle()
    if (routeError) return safeSupabaseError("email-attachments:route", routeError)
    if (!route || route.supplier_id !== effectiveSupplierId) {
      return jsonError("routeId does not belong to the selected supplier", 400)
    }
  }

  const { data: updated, error } = await supabase
    .from("email_attachment_library")
    .update(updates)
    .eq("id", id)
    .select("id, name, file_name, supplier_id, supplier_kind, route_id, email_kinds")
    .maybeSingle()

  if (error) return safeSupabaseError("email-attachments:update", error)
  if (!updated) return jsonError("Attachment not found", 404)

  await writeAuditLog(supabase, {
    actor: auth.value.actorName,
    actorUserId: auth.value.userId,
    entityType: "Settings",
    entityId: "email-attachments",
    action: "attachment_library_updated",
    meta: {
      library_id: id,
      name: updated.name,
      supplier_id: updated.supplier_id,
      supplier_kind: updated.supplier_kind,
      route_id: updated.route_id,
      email_kinds: updated.email_kinds ?? [],
    },
  })

  return Response.json({
    id: updated.id,
    name: updated.name,
    fileName: updated.file_name,
    supplierId: updated.supplier_id,
    routeId: updated.route_id,
    supplierKind: updated.supplier_kind,
    emailKinds: updated.email_kinds ?? [],
  })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSettingsWrite()
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return jsonError("Invalid id", 400)

  const { supabase } = auth.value

  const { data: row, error: fetchError } = await supabase
    .from("email_attachment_library")
    .select("id, name, file_name, storage_path")
    .eq("id", id)
    .maybeSingle()

  if (fetchError) return safeSupabaseError("email-attachments:fetch", fetchError)
  if (!row) return jsonError("Attachment not found", 404)

  const { error: deleteError } = await supabase
    .from("email_attachment_library")
    .delete()
    .eq("id", id)

  if (deleteError) return safeSupabaseError("email-attachments:delete", deleteError)

  // Best-effort: a stray storage object is harmless, a broken delete is not.
  await supabase.storage.from(ATTACHMENTS_BUCKET).remove([row.storage_path]).catch(() => undefined)

  await writeAuditLog(supabase, {
    actor: auth.value.actorName,
    actorUserId: auth.value.userId,
    entityType: "Settings",
    entityId: "email-attachments",
    action: "attachment_library_deleted",
    meta: { library_id: id, name: row.name, file_name: row.file_name },
  })

  return Response.json({ ok: true })
}
