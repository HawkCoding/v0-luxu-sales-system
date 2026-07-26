import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"
import { signatureBrandTextFieldsSchema } from "@/lib/email/signature-brands"

const ADMIN_ROLES = ["admin", "manager"]

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const auth = await requireRole(ADMIN_ROLES)
  if (!auth.ok) return auth.response

  const { id } = await params

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = signatureBrandTextFieldsSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error, "Invalid input")

  const { supabase } = auth.value

  const { data: existing, error: existingError } = await supabase
    .from("signature_brands")
    .select("*")
    .eq("id", id)
    .maybeSingle()

  if (existingError) return safeSupabaseError("signature-brands/[id]:read", existingError)
  if (!existing) return jsonError("Signature brand not found", 404)

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const { name, companyLine, registrationLine, tradingHours, divisionsLine, confidentiality, officeAddress, enabled, sortOrder } =
    parsed.data
  if (name !== undefined) updates.name = name
  if (companyLine !== undefined) updates.company_line = companyLine
  if (registrationLine !== undefined) updates.registration_line = registrationLine
  if (tradingHours !== undefined) updates.trading_hours = tradingHours
  if (divisionsLine !== undefined) updates.divisions_line = divisionsLine
  if (confidentiality !== undefined) updates.confidentiality = confidentiality
  if (officeAddress !== undefined) updates.office_address = officeAddress
  if (enabled !== undefined) updates.enabled = enabled
  if (sortOrder !== undefined) updates.sort_order = sortOrder

  if (Object.keys(updates).length === 1) {
    return jsonError("At least one field required", 400)
  }

  const { data, error } = await supabase
    .from("signature_brands")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single()

  if (error) return safeSupabaseError("signature-brands/[id]:update", error)

  await writeAuditLog(supabase, {
    actor: auth.value.profile.actorName,
    actorUserId: auth.value.user.id,
    entityType: "Settings",
    entityId: "signature-brands",
    action: "settings_changed",
    before: { [id]: existing },
    after: { [id]: data },
    meta: settingAuditMeta("signature_brands"),
  })

  return Response.json({
    id: data.id,
    name: data.name,
    sortOrder: data.sort_order,
    enabled: data.enabled,
    bannerUrl: data.banner_url,
    companyLine: data.company_line,
    registrationLine: data.registration_line,
    tradingHours: data.trading_hours,
    divisionsLine: data.divisions_line,
    confidentiality: data.confidentiality,
    officeAddress: data.office_address,
  })
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const auth = await requireRole(ADMIN_ROLES)
  if (!auth.ok) return auth.response

  const { id } = await params
  const { supabase } = auth.value

  const { data: existing } = await supabase.from("signature_brands").select("*").eq("id", id).maybeSingle()
  if (!existing) return jsonError("Signature brand not found", 404)

  const { error } = await supabase.from("signature_brands").delete().eq("id", id)
  if (error) return safeSupabaseError("signature-brands/[id]:delete", error)

  await writeAuditLog(supabase, {
    actor: auth.value.profile.actorName,
    actorUserId: auth.value.user.id,
    entityType: "Settings",
    entityId: "signature-brands",
    action: "settings_changed",
    before: { [id]: existing },
    after: null,
    meta: settingAuditMeta("signature_brands"),
  })

  return Response.json({ ok: true })
}
