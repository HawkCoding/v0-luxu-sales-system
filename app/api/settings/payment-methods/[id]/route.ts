import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"
import { paymentMethodFieldsSchema } from "@/lib/payment-methods"
import { PAYMENT_METHOD_COLUMNS } from "@/lib/supabase/columns"

const ADMIN_ROLES = ["admin", "manager"]

interface RouteParams {
  params: Promise<{ id: string }>
}

const BANKING_KEY_MAP = {
  bank_name: "bank_name",
  bank_account_name: "bank_account_name",
  bank_account_number: "bank_account_number",
  bank_branch_code: "bank_branch_code",
  bank_swift_code: "bank_swift_code",
  company_address: "company_address",
  company_reg_number: "company_reg_number",
  company_vat_number: "company_vat_number",
  company_tel: "company_tel",
  company_cell: "company_cell",
  company_fax: "company_fax",
  company_email: "company_email",
  company_website: "company_website",
} as const

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

  const parsed = paymentMethodFieldsSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error, "Invalid input")

  const { supabase } = auth.value

  const { data: existing, error: existingError } = await supabase
    .from("payment_methods")
    .select(PAYMENT_METHOD_COLUMNS)
    .eq("id", id)
    .maybeSingle()

  if (existingError) return safeSupabaseError("payment-methods/[id]:read", existingError)
  if (!existing) return jsonError("Payment method not found", 404)

  const { name, enabled, isDefault, sortOrder, ...bankingFields } = parsed.data

  if (enabled === false && existing.is_default) {
    return jsonError("The default payment method cannot be disabled. Set another method as default first.", 409)
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (name !== undefined) updates.name = name
  if (enabled !== undefined) updates.enabled = enabled
  if (sortOrder !== undefined) updates.sort_order = sortOrder
  for (const [key, column] of Object.entries(BANKING_KEY_MAP)) {
    const value = bankingFields[key as keyof typeof bankingFields]
    if (value !== undefined) updates[column] = value
  }

  if (Object.keys(updates).length === 1 && isDefault === undefined) {
    return jsonError("At least one field required", 400)
  }

  // Exclusivity: the unique partial index only allows one is_default = true
  // row, so clear the current default before flipping this one on.
  if (isDefault === true && !existing.is_default) {
    const { error: clearError } = await supabase
      .from("payment_methods")
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq("is_default", true)

    if (clearError) return safeSupabaseError("payment-methods/[id]:clear-default", clearError)
    updates.is_default = true
  } else if (isDefault === false) {
    if (existing.is_default) {
      return jsonError("Set another method as default instead of unsetting this one.", 409)
    }
  }

  const { data, error } = await supabase
    .from("payment_methods")
    .update(updates)
    .eq("id", id)
    .select(PAYMENT_METHOD_COLUMNS)
    .single()

  if (error) return safeSupabaseError("payment-methods/[id]:update", error)

  await writeAuditLog(supabase, {
    actor: auth.value.profile.actorName,
    actorUserId: auth.value.user.id,
    entityType: "Settings",
    entityId: "payment-methods",
    action: "settings_changed",
    before: { [id]: existing },
    after: { [id]: data },
    meta: settingAuditMeta("payment_methods"),
  })

  return Response.json({
    id: data.id,
    name: data.name,
    enabled: data.enabled,
    isDefault: data.is_default,
    sortOrder: data.sort_order,
    bankName: data.bank_name,
    bankAccountName: data.bank_account_name,
    bankAccountNumber: data.bank_account_number,
    bankBranchCode: data.bank_branch_code,
    bankSwiftCode: data.bank_swift_code,
    companyAddress: data.company_address,
    companyRegNumber: data.company_reg_number,
    companyVatNumber: data.company_vat_number,
    companyTel: data.company_tel,
    companyCell: data.company_cell,
    companyFax: data.company_fax,
    companyEmail: data.company_email,
    companyWebsite: data.company_website,
  })
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const auth = await requireRole(ADMIN_ROLES)
  if (!auth.ok) return auth.response

  const { id } = await params
  const { supabase } = auth.value

  const { data: existing } = await supabase
    .from("payment_methods")
    .select(PAYMENT_METHOD_COLUMNS)
    .eq("id", id)
    .maybeSingle()
  if (!existing) return jsonError("Payment method not found", 404)

  if (existing.is_default) {
    return jsonError("The default payment method cannot be deleted. Set another method as default first.", 409)
  }

  if (existing.enabled) {
    const { count, error: countError } = await supabase
      .from("payment_methods")
      .select("id", { count: "exact", head: true })
      .eq("enabled", true)
    if (countError) return safeSupabaseError("payment-methods/[id]:count-enabled", countError)
    if ((count ?? 0) <= 1) {
      return jsonError("At least one enabled payment method is required.", 409)
    }
  }

  const { error } = await supabase.from("payment_methods").delete().eq("id", id)
  if (error) return safeSupabaseError("payment-methods/[id]:delete", error)

  await writeAuditLog(supabase, {
    actor: auth.value.profile.actorName,
    actorUserId: auth.value.user.id,
    entityType: "Settings",
    entityId: "payment-methods",
    action: "settings_changed",
    before: { [id]: existing },
    after: null,
    meta: settingAuditMeta("payment_methods"),
  })

  return Response.json({ ok: true })
}
