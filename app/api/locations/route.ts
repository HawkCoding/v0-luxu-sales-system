import { NextResponse } from "next/server"
import { z } from "zod"
import { createSessionClient } from "@/lib/supabase/server"
import { mapLocation } from "@/lib/suppliers"

const allowedRoles = new Set(["admin", "manager"])

const createLocationSchema = z.object({
  name: z.string().trim().min(2, "Location name must be at least 2 characters").max(200),
  country: z.string().trim().max(100).optional().default("South Africa"),
  regionCode: z
    .union([z.string().trim().max(20), z.null()])
    .optional()
    .transform((value) => value ?? ""),
  parentLocationId: z.string().uuid().nullable().optional(),
})

const deleteLocationSchema = z.object({
  id: z.string().uuid(),
})

async function hasLocationWriteAccess(
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

  const { data: locations, error } = await supabase
    .from("locations")
    .select("id, name, country, parent_location_id, region_code, created_at, updated_at")
    .order("name", { ascending: true })

  if (error) {
    return NextResponse.json(
      { error: "Failed to load locations" },
      { status: 500 },
    )
  }

  return NextResponse.json((locations ?? []).map(mapLocation))
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

  const canWrite = await hasLocationWriteAccess(supabase, user.id)
  if (!canWrite) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let requestBody: unknown
  try {
    requestBody = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const parsedResult = createLocationSchema.safeParse(requestBody)
  if (!parsedResult.success) {
    return NextResponse.json(
      {
        error: "Invalid request payload",
        details: parsedResult.error.flatten().fieldErrors,
      },
      { status: 400 },
    )
  }

  const parsed = parsedResult.data
  const normalizedCountry = parsed.country.trim() || "South Africa"
  const normalizedRegionCode = parsed.regionCode.trim().toUpperCase() || null

  const { data: location, error } = await supabase
    .from("locations")
    .insert({
      name: parsed.name.trim(),
      country: normalizedCountry,
      region_code: normalizedRegionCode,
      parent_location_id: parsed.parentLocationId ?? null,
    })
    .select("id, name, country, parent_location_id, region_code, created_at, updated_at")
    .single()

  if (error || !location) {
    if (error?.code === "23505") {
      return NextResponse.json(
        { error: "A location with this name already exists" },
        { status: 409 },
      )
    }

    return NextResponse.json({ error: "Failed to create location" }, { status: 500 })
  }

  return NextResponse.json(mapLocation(location), { status: 201 })
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

  const canWrite = await hasLocationWriteAccess(supabase, user.id)
  if (!canWrite) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let requestBody: unknown
  try {
    requestBody = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const parsedResult = deleteLocationSchema.safeParse(requestBody)
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

  const [
    { count: linkedRoutes, error: routeCheckError },
    { count: childAreas, error: childAreaCheckError },
    { count: linkedSupplierAreas, error: supplierAreaCheckError },
  ] = await Promise.all([
    supabase
      .from("routes")
      .select("id", { count: "exact", head: true })
      .or(`origin_location_id.eq.${id},destination_location_id.eq.${id}`),
    supabase
      .from("locations")
      .select("id", { count: "exact", head: true })
      .eq("parent_location_id", id),
    supabase
      .from("suppliers")
      .select("id", { count: "exact", head: true })
      .eq("location_area_id", id),
  ])

  if (routeCheckError || childAreaCheckError || supplierAreaCheckError) {
    return NextResponse.json(
      { error: "Failed to validate location deletion" },
      { status: 500 },
    )
  }

  if ((childAreas ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          "Cannot delete this city because it has sub-areas. Remove the sub-areas first.",
      },
      { status: 409 },
    )
  }

  if ((linkedRoutes ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          "Cannot delete this location because it is used by one or more supplier routes.",
      },
      { status: 409 },
    )
  }

  if ((linkedSupplierAreas ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          "Cannot delete this area because it is assigned to one or more suppliers.",
      },
      { status: 409 },
    )
  }

  const { error: deleteError } = await supabase.from("locations").delete().eq("id", id)
  if (deleteError) {
    return NextResponse.json({ error: "Failed to delete location" }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
