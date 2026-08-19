import { z } from "zod"
import { requireAnyRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"
import { getInvoiceStatusOptions, requireSettingsWrite } from "@/lib/settings-access"

export async function GET() {
  const auth = await requireAnyRole()
  if (!auth.ok) return auth.response

  const options = await getInvoiceStatusOptions(auth.value.supabase)
  return Response.json({ options })
}

// Only the four system roles are storable: every status is derived from the booking's payment
// state, so a role-less "manual" label would never be applied to an invoice.
const putSchema = z.object({
  options: z
    .array(
      z.object({
        role: z.enum(["provisional", "confirmed", "paid", "cancelled"]),
        label: z.string().trim().min(1).max(40),
      }),
    )
    .min(1)
    .max(4),
})

export async function PUT(req: Request) {
  const auth = await requireSettingsWrite()
  if (!auth.ok) return auth.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = putSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error, "Invalid input")

  const roles = parsed.data.options.map((option) => option.role).filter(Boolean)
  if (new Set(roles).size !== roles.length) {
    return jsonError("Each system role may appear only once", 400)
  }

  const { supabase } = auth.value
  const before = await getInvoiceStatusOptions(supabase)
  const value = JSON.stringify(parsed.data.options)

  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: "invoice_status_options", value, updated_at: new Date().toISOString() })

  if (error) return safeSupabaseError("settings-invoice-statuses:upsert", error)

  await writeAuditLog(supabase, {
    actor: auth.value.actorName,
    actorUserId: auth.value.userId,
    entityType: "Settings",
    entityId: "invoice-statuses",
    action: "settings_changed",
    before: { invoice_status_options: before.map((o) => ({ role: o.role, label: o.label })) },
    after: { invoice_status_options: parsed.data.options.map((o) => ({ role: o.role, label: o.label })) },
    meta: settingAuditMeta("invoice_status_options"),
  })

  return Response.json({ options: parsed.data.options })
}
