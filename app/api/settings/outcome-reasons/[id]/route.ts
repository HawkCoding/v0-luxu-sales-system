import { requireRole } from "@/lib/api/auth"
import { jsonError, safeSupabaseError } from "@/lib/api/responses"

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

  const body = raw as Record<string, unknown>
  if (typeof body.active !== "boolean") {
    return jsonError("Field 'active' (boolean) is required", 400)
  }

  const { error } = await supabase
    .from("outcome_reasons")
    .update({ active: body.active })
    .eq("id", id)

  if (error) return safeSupabaseError("settings:outcome-reasons-update", error)

  return Response.json({ ok: true })
}
