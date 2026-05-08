import { z } from "zod"
import { requireRole, requireUser } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"

const TEMPLATE_COLUMNS = "id, key, subject, body_html, version, active"

const templatePatchSchema = z
  .object({
    id: z.string().uuid(),
    subject: z.string().max(500).optional(),
    bodyHtml: z.string().max(200_000).optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (v) => v.subject !== undefined || v.bodyHtml !== undefined || v.active !== undefined,
    { message: "Body must include at least one updatable field" },
  )

export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { data: templates, error } = await auth.value.supabase
    .from("templates")
    .select(TEMPLATE_COLUMNS)
    .order("key", { ascending: true })

  if (error) return safeSupabaseError("templates:list", error)

  return Response.json(
    (templates ?? []).map((t) => ({
      id: t.id,
      key: t.key,
      subject: t.subject,
      bodyHtml: t.body_html,
      version: t.version,
      active: t.active,
    })),
  )
}

export async function PATCH(req: Request) {
  const auth = await requireRole(["admin", "manager"])
  if (!auth.ok) return auth.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = templatePatchSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)

  const { supabase, profile, user } = auth.value

  const { data: existing, error: existingError } = await supabase
    .from("templates")
    .select("version")
    .eq("id", parsed.data.id)
    .single()

  if (existingError || !existing) return jsonError("Template not found", 404)

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (parsed.data.subject !== undefined) updates.subject = parsed.data.subject
  if (parsed.data.bodyHtml !== undefined) updates.body_html = parsed.data.bodyHtml
  if (parsed.data.active !== undefined) updates.active = parsed.data.active
  updates.version = existing.version + 1

  const { data: updated, error } = await supabase
    .from("templates")
    .update(updates)
    .eq("id", parsed.data.id)
    .select(TEMPLATE_COLUMNS)
    .single()

  if (error || !updated) return safeSupabaseError("templates:update", error)

  await supabase.from("audit_logs").insert({
    actor: profile.actorName,
    actor_user_id: user.id,
    entity_type: "Template",
    entity_id: parsed.data.id,
    action: "template_updated",
    after_json: { version: updated.version },
  })

  return Response.json({
    id: updated.id,
    key: updated.key,
    subject: updated.subject,
    bodyHtml: updated.body_html,
    version: updated.version,
    active: updated.active,
  })
}
