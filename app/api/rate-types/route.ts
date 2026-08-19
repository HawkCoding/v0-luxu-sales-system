import { safeSupabaseError } from "@/lib/api/responses"
import { NextResponse } from "next/server"
import { z } from "zod"
import { createSessionClient } from "@/lib/supabase/server"
import { mapRateType } from "@/lib/suppliers"
import { SETTINGS_WRITE_ROLES } from "@/lib/permissions"

const postSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(32)
    .regex(/^[A-Z0-9_]+$/, "Code must use uppercase letters, digits, or underscores"),
  name: z.string().trim().min(1, "Name is required").max(100),
})

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
  if (profileError || !profile) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return {
    ok: true as const,
    value: {
      supabase,
      canEdit: (SETTINGS_WRITE_ROLES as readonly string[]).includes(profile.clearance_level),
    },
  }
}

export async function GET() {
  const auth = await authenticate()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.value.supabase
    .from("rate_types")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })

  if (error) {
    return safeSupabaseError("rate-types", error)
  }

  return NextResponse.json({
    rateTypes: (data ?? []).map(mapRateType),
    canEdit: auth.value.canEdit,
  })
}

export async function POST(req: Request) {
  const auth = await authenticate()
  if (!auth.ok) return auth.response

  if (!auth.value.canEdit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = postSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
  }

  const supabase = auth.value.supabase

  const { data: existing, error: existingError } = await supabase
    .from("rate_types")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)

  if (existingError) {
    return safeSupabaseError("rate-types", existingError)
  }

  const nextSortOrder = (existing?.[0]?.sort_order ?? -1) + 1

  const { data, error } = await supabase
    .from("rate_types")
    .insert({
      code: parsed.data.code,
      name: parsed.data.name,
      sort_order: nextSortOrder,
      is_default: false,
    })
    .select("*")
    .single()

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A rate type with that code already exists." }, { status: 409 })
    }
    return safeSupabaseError("rate-types", error)
  }

  return NextResponse.json(mapRateType(data), { status: 201 })
}
