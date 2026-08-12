import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"

const updateSchema = z.object({
  active: z.boolean(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["admin", "manager"])
  if (!auth.ok) return auth.response

  const { supabase } = auth.value
  const { id } = await params

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = updateSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)

  const { active } = parsed.data

  const { data, error } = await supabase
    .from("outcome_reasons")
    .update({ active })
    .eq("id", id)
    .select("id, label, applies_to, active")
    .maybeSingle()

  if (error) return safeSupabaseError("settings:outcome-reasons-update", error)
  if (!data) return jsonError("Outcome reason not found", 404)

  await writeAuditLog(supabase, {
    actor: auth.value.profile.actorName,
    actorUserId: auth.value.user.id,
    entityType: "Settings",
    entityId: `outcome_reason:${data.id}`,
    action: "settings_changed",
    after: { label: data.label, appliesTo: data.applies_to, active: data.active },
    meta: settingAuditMeta("outcome_reasons"),
  })

  return Response.json({ ok: true })
}
