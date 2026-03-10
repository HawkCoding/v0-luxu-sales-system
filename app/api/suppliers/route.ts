import { NextResponse } from "next/server"
import { z } from "zod"
import { mapSupplier } from "@/lib/suppliers"
import { allowedRoles, requireAuthenticatedUser } from "./helpers"

const createSupplierSchema = z.object({
  kind: z.enum(["train_operator", "hotel_property", "transfers"]),
  name: z.string().trim().min(1, "Supplier name is required").max(200),
  email: z.string().trim().email().or(z.literal("")),
  phone: z.string().trim().max(100),
  website: z.string().trim().max(255),
  location: z.string().trim().max(255),
  notes: z.string().trim().max(5000),
})

export async function GET() {
  const auth = await requireAuthenticatedUser()
  if ("error" in auth) {
    return auth.error
  }

  const { supabase } = auth
  const { data: suppliers, error } = await supabase
    .from("suppliers")
    .select("*")
    .order("kind", { ascending: true })
    .order("name", { ascending: true })

  if (error) {
    return NextResponse.json(
      { error: "Failed to load suppliers" },
      { status: 500 },
    )
  }

  return NextResponse.json((suppliers ?? []).map(mapSupplier))
}

export async function POST(req: Request) {
  const auth = await requireAuthenticatedUser()
  if ("error" in auth) {
    return auth.error
  }

  const { supabase, user } = auth

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("clearance_level")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile || !allowedRoles.has(profile.clearance_level)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let parsed: z.infer<typeof createSupplierSchema>
  try {
    parsed = createSupplierSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
  }

  const { data: supplier, error } = await supabase
    .from("suppliers")
    .insert({
      kind: parsed.kind,
      name: parsed.name.trim(),
      email: parsed.email.trim() || null,
      phone: parsed.phone.trim() || null,
      website: parsed.website.trim() || null,
      location: parsed.location.trim() || null,
      notes: parsed.notes.trim() || null,
      active: true,
    })
    .select("*")
    .single()

  if (error || !supplier) {
    if (error?.code === "23505") {
      return NextResponse.json(
        { error: "A supplier with this name already exists." },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: "Failed to create supplier" }, { status: 500 })
  }

  return NextResponse.json(mapSupplier(supplier), { status: 201 })
}
