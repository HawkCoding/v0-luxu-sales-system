import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"

const createSchema = z.object({
  label: z.string().min(1).max(120),
  appliesTo: z.enum(["Lost", "Cancelled", "Both"]),
})

export async function GET() {
  const auth = await requireRole(["admin", "manager", "consultant", "readonly"])
  if (!auth.ok) return auth.response

  const { supabase } = auth.value

  const { data, error } = await supabase
    .from("outcome_reasons")
    .select("id, label, applies_to, active, created_at")
    .order("applies_to")
    .order("label")

  if (error) return safeSupabaseError("settings:outcome-reasons-list", error)

  return Response.json(
    (data ?? []).map((r) => ({
      id: r.id,
      label: r.label,
      appliesTo: r.applies_to,
      active: r.active,
      createdAt: r.created_at,
    })),
  )
}

export async function POST(req: Request) {
  const auth = await requireRole(["admin", "manager"])
  if (!auth.ok) return auth.response

  const { supabase } = auth.value

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = createSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)

  const { label, appliesTo } = parsed.data

  const { data, error } = await supabase
    .from("outcome_reasons")
    .insert({ label, applies_to: appliesTo })
    .select("id, label, applies_to, active, created_at")
    .single()

  if (error) return safeSupabaseError("settings:outcome-reasons-create", error)

  await writeAuditLog(supabase, {
    actor: auth.value.profile.actorName,
    actorUserId: auth.value.user.id,
    entityType: "Settings",
    entityId: `outcome_reason:${data.id}`,
    action: "settings_changed",
    after: { label, appliesTo },
    meta: settingAuditMeta("outcome_reasons"),
  })

  return Response.json(
    { id: data.id, label: data.label, appliesTo: data.applies_to, active: data.active, createdAt: data.created_at },
    { status: 201 },
  )
}
