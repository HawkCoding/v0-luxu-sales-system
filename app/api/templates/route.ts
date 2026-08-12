import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { humanizeTemplateKey } from "@/lib/templates/humanize-key"

const TEMPLATE_COLUMNS = "id, key, name, subject, body_html, version, active, is_system, sort_order"

const templatePatchSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(120).optional(),
    subject: z.string().max(500).optional(),
    bodyHtml: z.string().max(200_000).optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().nonnegative().optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.subject !== undefined ||
      v.bodyHtml !== undefined ||
      v.active !== undefined ||
      v.sortOrder !== undefined,
    { message: "Body must include at least one updatable field" },
  )

// Mirrors "view:templates" in lib/role-context.tsx — template subjects and
// bodies are internal copy, not consultant- or readonly-visible.
export async function GET() {
  const auth = await requireRole(["admin", "manager"])
  if (!auth.ok) return auth.response

  const { data: templates, error } = await auth.value.supabase
    .from("templates")
    .select(TEMPLATE_COLUMNS)
    .order("sort_order", { ascending: true })

  if (error) return safeSupabaseError("templates:list", error)

  return Response.json(
    (templates ?? []).map((t) => ({
      id: t.id,
      key: t.key,
      name: t.name ?? humanizeTemplateKey(t.key),
      subject: t.subject,
      bodyHtml: t.body_html,
      version: t.version,
      active: t.active,
      isSystem: t.is_system,
      sortOrder: t.sort_order,
    })),
  )
}

const templateCreateSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  subject: z.string().trim().min(1, "Subject is required").max(500),
  bodyHtml: z.string().max(200_000).default(""),
})

// Slugify a display name into a stable, unique template key (custom templates
// only — the four built-in keys are reserved/system). Keys are lower_snake,
// length-capped, and never empty so they stay readable and collision-safe.
const KEY_MAX_LENGTH = 60

function slugifyKey(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, KEY_MAX_LENGTH)
    .replace(/_+$/g, "") // re-trim a trailing underscore left by truncation
  return base || "template"
}

export async function POST(req: Request) {
  const auth = await requireRole(["admin", "manager"])
  if (!auth.ok) return auth.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = templateCreateSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)

  const { supabase, profile, user } = auth.value

  // Resolve a unique key for the new custom template.
  const slugBase = slugifyKey(parsed.data.name)
  const { data: existingKeys } = await supabase
    .from("templates")
    .select("key")
    .or(`key.eq.${slugBase},key.like.${slugBase}_%`)
  const used = new Set((existingKeys ?? []).map((row) => row.key))
  let key = slugBase
  let suffix = 2
  while (used.has(key)) {
    key = `${slugBase}_${suffix}`
    suffix += 1
  }

  const { data: maxRow } = await supabase
    .from("templates")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextSortOrder = (maxRow?.sort_order ?? -1) + 1

  const { data: created, error } = await supabase
    .from("templates")
    .insert({
      key,
      name: parsed.data.name,
      subject: parsed.data.subject,
      body_html: parsed.data.bodyHtml,
      version: 1,
      active: true,
      is_system: false,
      sort_order: nextSortOrder,
    })
    .select(TEMPLATE_COLUMNS)
    .single()

  if (error || !created) return safeSupabaseError("templates:create", error)

  await supabase.from("audit_logs").insert({
    actor: profile.actorName,
    actor_user_id: user.id,
    entity_type: "Template",
    entity_id: created.id,
    action: "template_created",
    after_json: { key: created.key },
  })

  return Response.json(
    {
      id: created.id,
      key: created.key,
      name: created.name ?? humanizeTemplateKey(created.key),
      subject: created.subject,
      bodyHtml: created.body_html,
      version: created.version,
      active: created.active,
      isSystem: created.is_system,
      sortOrder: created.sort_order,
    },
    { status: 201 },
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
  if (parsed.data.name !== undefined) updates.name = parsed.data.name
  if (parsed.data.subject !== undefined) updates.subject = parsed.data.subject
  if (parsed.data.bodyHtml !== undefined) updates.body_html = parsed.data.bodyHtml
  if (parsed.data.active !== undefined) updates.active = parsed.data.active
  if (parsed.data.sortOrder !== undefined) updates.sort_order = parsed.data.sortOrder
  if (parsed.data.subject !== undefined || parsed.data.bodyHtml !== undefined) {
    updates.version = existing.version + 1
  }

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
    name: updated.name ?? humanizeTemplateKey(updated.key),
    subject: updated.subject,
    bodyHtml: updated.body_html,
    version: updated.version,
    active: updated.active,
    isSystem: updated.is_system,
    sortOrder: updated.sort_order,
  })
}
