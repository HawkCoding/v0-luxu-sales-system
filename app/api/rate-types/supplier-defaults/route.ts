import { NextResponse } from "next/server"
import { z } from "zod"
import { createSessionClient } from "@/lib/supabase/server"
import type { SupplierKind, SupplierKindDefaultRateType } from "@/lib/types"

const ALLOWED_ROLES = new Set(["admin", "manager"])

const SUPPLIER_KINDS = [
  "train_operator",
  "hotel_property",
  "transfers",
  "vehicle_rental",
  "tour_operator",
  "airline",
] as const satisfies readonly SupplierKind[]

const putSchema = z.object({
  defaults: z
    .array(
      z.object({
        kind: z.enum(SUPPLIER_KINDS),
        rateTypeId: z.string().uuid(),
      }),
    )
    .min(1),
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
    value: { supabase, canEdit: ALLOWED_ROLES.has(profile.clearance_level) },
  }
}

export async function GET() {
  const auth = await authenticate()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.value.supabase
    .from("supplier_kind_default_rate_types")
    .select("kind, rate_type_id")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const defaults: SupplierKindDefaultRateType[] = (data ?? []).map((row) => ({
    kind: row.kind as SupplierKind,
    rateTypeId: row.rate_type_id,
  }))

  return NextResponse.json({ defaults, canEdit: auth.value.canEdit })
}

export async function PUT(req: Request) {
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

  const parsed = putSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
  }

  const supabase = auth.value.supabase

  // Reject any rate type that does not exist or is archived.
  const rateTypeIds = [...new Set(parsed.data.defaults.map((entry) => entry.rateTypeId))]
  const { data: rateTypes, error: rateTypeError } = await supabase
    .from("rate_types")
    .select("id, archived_at")
    .in("id", rateTypeIds)

  if (rateTypeError) {
    return NextResponse.json({ error: rateTypeError.message }, { status: 500 })
  }

  const valid = new Set((rateTypes ?? []).filter((rt) => !rt.archived_at).map((rt) => rt.id))
  if (rateTypeIds.some((id) => !valid.has(id))) {
    return NextResponse.json({ error: "One or more rate types are invalid or archived." }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from("supplier_kind_default_rate_types")
    .upsert(
      parsed.data.defaults.map((entry) => ({
        kind: entry.kind,
        rate_type_id: entry.rateTypeId,
        updated_at: now,
      })),
      { onConflict: "kind" },
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const defaults: SupplierKindDefaultRateType[] = parsed.data.defaults.map((entry) => ({
    kind: entry.kind,
    rateTypeId: entry.rateTypeId,
  }))

  return NextResponse.json({ defaults })
}
