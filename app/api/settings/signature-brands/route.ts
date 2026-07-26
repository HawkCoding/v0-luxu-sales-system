import { z } from "zod"
import { requireRole, requireUser } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"
import { MAX_SIGNATURE_BRANDS, slugify } from "@/lib/email/signature-brands"
import { getEmailSignatureSettings } from "@/lib/settings-access"

const ADMIN_ROLES = ["admin", "manager"]

/**
 * Brand list for the send dialog's signature picker (any authenticated user)
 * and the admin brand editor (which also needs disabled brands to manage
 * them). Non-admins only ever see enabled brands — a disabled brand should
 * not be selectable, so it is simply absent from their list.
 */
export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { supabase, profile } = auth.value
  const isAdmin = ADMIN_ROLES.includes(profile.clearanceLevel)

  // Fetch every column regardless of role — simpler to type — but only
  // admins get the extra fields back in the response (see the map below).
  let query = supabase
    .from("signature_brands")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  if (!isAdmin) query = query.eq("enabled", true)

  const { data, error } = await query
  if (error) return safeSupabaseError("signature-brands:list", error)

  const settings = await getEmailSignatureSettings()

  return Response.json({
    brands: (data ?? []).map((row) =>
      isAdmin
        ? {
            id: row.id,
            name: row.name,
            sortOrder: row.sort_order,
            enabled: row.enabled,
            bannerUrl: row.banner_url,
            bannerWidth: row.banner_width,
            bannerHeight: row.banner_height,
            badges: row.badges,
            companyLine: row.company_line,
            registrationLine: row.registration_line,
            tradingHours: row.trading_hours,
            divisionsLine: row.divisions_line,
            confidentiality: row.confidentiality,
            officeAddress: row.office_address,
          }
        : {
            id: row.id,
            name: row.name,
            sortOrder: row.sort_order,
            enabled: row.enabled,
          },
    ),
    enabled: settings.signature_enabled === "true",
  })
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
})

/** Creates a new brand at the end of the sort order. Slugs are derived from the name and immutable after creation. */
export async function POST(req: Request) {
  const auth = await requireRole(ADMIN_ROLES)
  if (!auth.ok) return auth.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = createSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error, "Invalid input")

  const { supabase } = auth.value

  const { count, error: countError } = await supabase
    .from("signature_brands")
    .select("id", { count: "exact", head: true })

  if (countError) return safeSupabaseError("signature-brands:count", countError)
  if ((count ?? 0) >= MAX_SIGNATURE_BRANDS) {
    return jsonError(`Maximum of ${MAX_SIGNATURE_BRANDS} signature brands allowed`, 409)
  }

  const { data: maxSort } = await supabase
    .from("signature_brands")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()

  const baseSlug = slugify(parsed.data.name) || "brand"
  let slug = baseSlug
  let suffix = 2
  // Slugs are unique; a name collision appends -2, -3, ... rather than failing the create.
  for (;;) {
    const { data: existing } = await supabase
      .from("signature_brands")
      .select("id")
      .eq("slug", slug)
      .maybeSingle()
    if (!existing) break
    slug = `${baseSlug}-${suffix}`
    suffix += 1
  }

  const { data, error } = await supabase
    .from("signature_brands")
    .insert({
      name: parsed.data.name,
      slug,
      sort_order: (maxSort?.sort_order ?? -1) + 1,
    })
    .select("*")
    .single()

  if (error) return safeSupabaseError("signature-brands:create", error)

  await writeAuditLog(supabase, {
    actor: auth.value.profile.actorName,
    actorUserId: auth.value.user.id,
    entityType: "Settings",
    entityId: "signature-brands",
    action: "settings_changed",
    before: null,
    after: { created: data.slug },
    meta: settingAuditMeta("signature_brands"),
  })

  return Response.json({ id: data.id, name: data.name, sortOrder: data.sort_order, enabled: data.enabled })
}
