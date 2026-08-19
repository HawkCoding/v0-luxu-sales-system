import { z } from "zod"
import { requireAnyRole } from "@/lib/api/auth"
import { jsonError, safeSupabaseError } from "@/lib/api/responses"
import { createServiceClient } from "@/lib/supabase/server"

interface RouteParams {
  params: Promise<{ id: string }>
}

const idSchema = z.string().uuid()

// Delete a custom email template. Built-in (is_system) templates are protected
// because they back the quote / follow-up / deposit / voucher send flows.
// RLS restricts DELETE to admins, so after the app-layer admin|manager gate we
// use the service client intentionally and enforce the system-template guard
// here in code.
export async function DELETE(_req: Request, { params }: RouteParams) {
  const auth = await requireAnyRole()
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!idSchema.safeParse(id).success) return jsonError("Invalid template id", 400)

  const { profile, user } = auth.value
  const service = createServiceClient()

  const { data: existing, error: lookupError } = await service
    .from("templates")
    .select("id, key, is_system")
    .eq("id", id)
    .maybeSingle()

  if (lookupError) return safeSupabaseError("templates:delete:lookup", lookupError)
  if (!existing) return jsonError("Template not found", 404)
  if (existing.is_system) {
    return jsonError("Built-in templates cannot be deleted. You can edit them or create a custom template instead.", 409)
  }

  const { error } = await service.from("templates").delete().eq("id", id)
  if (error) return safeSupabaseError("templates:delete", error)

  await service.from("audit_logs").insert({
    actor: profile.actorName,
    actor_user_id: user.id,
    entity_type: "Template",
    entity_id: id,
    action: "template_deleted",
    before_json: { key: existing.key },
  })

  return Response.json({ ok: true })
}
