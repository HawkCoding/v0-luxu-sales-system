import { NextResponse } from "next/server"
import { z } from "zod"
import { createSessionClient } from "@/lib/supabase/server"
import { mapRateType } from "@/lib/suppliers"

const ALLOWED_ROLES = new Set(["admin", "manager"])

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    sortOrder: z.number().int().nonnegative().optional(),
    isDefault: z.literal(true).optional(),
    archived: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "No fields to update" })

async function authenticate() {
  const supabase = await createSessionClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("clearance_level")
    .eq("user_id", user.id)
    .single()
  if (profileError || !profile || !ALLOWED_ROLES.has(profile.clearance_level)) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return { ok: true as const, value: { supabase } }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate()
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
  }

  const supabase = auth.value.supabase

  const { data: existing, error: existingError } = await supabase
    .from("rate_types")
    .select("*")
    .eq("id", id)
    .maybeSingle()

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 })
  }
  if (!existing) {
    return NextResponse.json({ error: "Rate type not found" }, { status: 404 })
  }

  // Promoting one to default requires demoting the others.
  if (parsed.data.isDefault === true) {
    const { error: clearError } = await supabase
      .from("rate_types")
      .update({ is_default: false })
      .neq("id", id)
    if (clearError) {
      return NextResponse.json({ error: clearError.message }, { status: 500 })
    }
  }

  // Block archiving the default — promote another rate type first.
  if (parsed.data.archived === true && existing.is_default) {
    return NextResponse.json(
      { error: "Cannot archive the default rate type. Set another rate type as default first." },
      { status: 409 },
    )
  }

  // Block archiving a system-standard rate type (Rack Rate / Standard Tour
  // Operator). These must always exist; they may be renamed but not removed.
  if (parsed.data.archived === true && existing.is_standard) {
    return NextResponse.json(
      { error: "Cannot archive a standard rate type." },
      { status: 409 },
    )
  }

  // Block archiving while rate cards still reference this type — otherwise those
  // cards become orphans that the supplier editor hides but still submits,
  // making every supplier save fail with a 409 the manager cannot self-fix.
  if (parsed.data.archived === true) {
    const { count, error: refError } = await supabase
      .from("rate_cards")
      .select("id", { count: "exact", head: true })
      .eq("rate_type_id", id)
    if (refError) {
      return NextResponse.json({ error: refError.message }, { status: 500 })
    }
    if (count && count > 0) {
      return NextResponse.json(
        {
          error: `Cannot archive this rate type — ${count} rate card${count === 1 ? "" : "s"} still use it. Reassign or remove those rates first.`,
        },
        { status: 409 },
      )
    }
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof parsed.data.name === "string") updates.name = parsed.data.name
  if (typeof parsed.data.sortOrder === "number") updates.sort_order = parsed.data.sortOrder
  if (parsed.data.isDefault === true) updates.is_default = true
  if (typeof parsed.data.archived === "boolean") {
    updates.archived_at = parsed.data.archived ? new Date().toISOString() : null
  }

  const { data, error } = await supabase
    .from("rate_types")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(mapRateType(data))
}
