import { NextResponse } from "next/server"
import { z } from "zod"
import { createSessionClient } from "@/lib/supabase/server"

const allowedRoles = new Set(["admin", "manager"])

const createSupplierEmailLabelSchema = z.object({
  name: z.string().trim().min(1, "Label is required").max(100),
})

const deleteSupplierEmailLabelSchema = z.object({
  id: z.string().uuid(),
})

async function hasSupplierEmailLabelWriteAccess(
  supabase: Awaited<ReturnType<typeof createSessionClient>>,
  userId: string,
) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("clearance_level")
    .eq("user_id", userId)
    .single()

  if (error || !profile) return false
  return allowedRoles.has(profile.clearance_level)
}

export async function GET() {
  const supabase = await createSessionClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: labels, error } = await supabase
    .from("supplier_email_labels")
    .select("id, name, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })

  if (error) {
    return NextResponse.json(
      { error: "Failed to load supplier email labels" },
      { status: 500 },
    )
  }

  return NextResponse.json(
    (labels ?? []).map((label) => ({
      id: label.id,
      name: label.name,
      sortOrder: label.sort_order,
    })),
  )
}

export async function POST(req: Request) {
  const supabase = await createSessionClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const canWrite = await hasSupplierEmailLabelWriteAccess(supabase, user.id)
  if (!canWrite) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let requestBody: unknown
  try {
    requestBody = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const parsedResult = createSupplierEmailLabelSchema.safeParse(requestBody)
  if (!parsedResult.success) {
    return NextResponse.json(
      {
        error: "Invalid request payload",
        details: parsedResult.error.flatten().fieldErrors,
      },
      { status: 400 },
    )
  }

  const normalizedName = parsedResult.data.name.trim()
  const { data: label, error } = await supabase
    .from("supplier_email_labels")
    .insert({
      name: normalizedName,
      sort_order: 999,
    })
    .select("id, name, sort_order")
    .single()

  if (error || !label) {
    if (error?.code === "23505") {
      return NextResponse.json(
        { error: "A label with this name already exists" },
        { status: 409 },
      )
    }

    return NextResponse.json(
      { error: "Failed to create supplier email label" },
      { status: 500 },
    )
  }

  return NextResponse.json(
    {
      id: label.id,
      name: label.name,
      sortOrder: label.sort_order,
    },
    { status: 201 },
  )
}

export async function DELETE(req: Request) {
  const supabase = await createSessionClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const canWrite = await hasSupplierEmailLabelWriteAccess(supabase, user.id)
  if (!canWrite) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let requestBody: unknown
  try {
    requestBody = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const parsedResult = deleteSupplierEmailLabelSchema.safeParse(requestBody)
  if (!parsedResult.success) {
    return NextResponse.json(
      {
        error: "Invalid request payload",
        details: parsedResult.error.flatten().fieldErrors,
      },
      { status: 400 },
    )
  }

  const { id } = parsedResult.data
  const { error } = await supabase.from("supplier_email_labels").delete().eq("id", id)
  if (error) {
    return NextResponse.json(
      { error: "Failed to delete supplier email label" },
      { status: 500 },
    )
  }

  return new NextResponse(null, { status: 204 })
}
