import { requireRole, requireUser } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"
import { MAX_PAYMENT_METHODS, createPaymentMethodSchema } from "@/lib/payment-methods"
import { PAYMENT_METHOD_COLUMNS } from "@/lib/supabase/columns"

const ADMIN_ROLES = ["admin", "manager"]

/**
 * Method list for the invoice-generation and send-dialog pickers (any
 * authenticated user) and the admin editor (which also needs disabled
 * methods to manage them). Non-admins only ever see enabled methods, reduced
 * to the fields the picker needs.
 */
export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { supabase, profile } = auth.value
  const isAdmin = ADMIN_ROLES.includes(profile.clearanceLevel)

  let query = supabase
    .from("payment_methods")
    .select(PAYMENT_METHOD_COLUMNS)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  if (!isAdmin) query = query.eq("enabled", true)

  const { data, error } = await query
  if (error) return safeSupabaseError("payment-methods:list", error)

  return Response.json({
    methods: (data ?? []).map((row) =>
      isAdmin
        ? {
            id: row.id,
            name: row.name,
            enabled: row.enabled,
            isDefault: row.is_default,
            sortOrder: row.sort_order,
            bankName: row.bank_name,
            bankAccountName: row.bank_account_name,
            bankAccountNumber: row.bank_account_number,
            bankBranchCode: row.bank_branch_code,
            bankSwiftCode: row.bank_swift_code,
            companyAddress: row.company_address,
            companyRegNumber: row.company_reg_number,
            companyVatNumber: row.company_vat_number,
            companyTel: row.company_tel,
            companyCell: row.company_cell,
            companyFax: row.company_fax,
            companyEmail: row.company_email,
            companyWebsite: row.company_website,
          }
        : {
            id: row.id,
            name: row.name,
            enabled: row.enabled,
            isDefault: row.is_default,
            sortOrder: row.sort_order,
          },
    ),
  })
}

/** Creates a new payment method at the end of the sort order, blank except for its name. */
export async function POST(req: Request) {
  const auth = await requireRole(ADMIN_ROLES)
  if (!auth.ok) return auth.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = createPaymentMethodSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error, "Invalid input")

  const { supabase } = auth.value

  const { count, error: countError } = await supabase
    .from("payment_methods")
    .select("id", { count: "exact", head: true })

  if (countError) return safeSupabaseError("payment-methods:count", countError)
  if ((count ?? 0) >= MAX_PAYMENT_METHODS) {
    return jsonError(`Maximum of ${MAX_PAYMENT_METHODS} payment methods allowed`, 409)
  }

  const { data: maxSort } = await supabase
    .from("payment_methods")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()

  // The very first method in an installation becomes the default automatically.
  const isFirst = (count ?? 0) === 0

  const { data, error } = await supabase
    .from("payment_methods")
    .insert({
      name: parsed.data.name,
      sort_order: (maxSort?.sort_order ?? -1) + 1,
      is_default: isFirst,
    })
    .select("id, name, sort_order, enabled, is_default")
    .single()

  if (error) return safeSupabaseError("payment-methods:create", error)

  await writeAuditLog(supabase, {
    actor: auth.value.profile.actorName,
    actorUserId: auth.value.user.id,
    entityType: "Settings",
    entityId: "payment-methods",
    action: "settings_changed",
    before: null,
    after: { created: data.name },
    meta: settingAuditMeta("payment_methods"),
  })

  return Response.json({
    id: data.id,
    name: data.name,
    sortOrder: data.sort_order,
    enabled: data.enabled,
    isDefault: data.is_default,
  })
}
