import { NextResponse } from "next/server"
import { z } from "zod"
import { buildSupplierSlugBase, mapSupplier } from "@/lib/suppliers"
import { buildRouteName } from "@/lib/routes/route-name"
import { requireAuthenticatedUser } from "../helpers"
import { createServiceClient } from "@/lib/supabase/server"

const allowedRoles = new Set(["admin", "manager", "consultant"])

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^[+\d\s()-]*$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const quickSupplierSchema = z
  .object({
    kind: z.enum([
      "train_operator",
      "hotel_property",
      "transfers",
      "vehicle_rental",
      "tour_operator",
      "airline",
    ]),
    name: z.string().trim().min(2, "Supplier name must be at least 2 characters").max(200),
    email: z
      .string()
      .trim()
      .max(255)
      .refine((v) => v === "" || EMAIL_PATTERN.test(v), { message: "Enter a valid email" })
      .default(""),
    phone: z
      .string()
      .trim()
      .max(100)
      .refine((v) => v === "" || PHONE_PATTERN.test(v), { message: "Invalid phone format" })
      .default(""),
    locationId: z.string().uuid().nullable().optional(),
    routeName: z.string().trim().max(500).default(""),
    originLocationId: z.string().uuid().nullable().optional(),
    destinationLocationId: z.string().uuid().nullable().optional(),
    pickupPoint: z.string().trim().max(500).default(""),
    dropoffPoint: z.string().trim().max(500).default(""),
    suiteTypeName: z.string().trim().min(1, "Suite type name is required").max(200),
    price: z.number().finite().nonnegative(),
    validFrom: z.string().regex(DATE_PATTERN, "Expected YYYY-MM-DD"),
    validTo: z.string().regex(DATE_PATTERN, "Expected YYYY-MM-DD").nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const needsLocations = value.kind === "train_operator" || value.kind === "airline"
    const isTransport = value.kind === "transfers" || value.kind === "vehicle_rental"
    const autoDerive = value.kind === "train_operator"

    if (!autoDerive && value.routeName.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["routeName"],
        message: "Route name is required",
      })
    }
    if (needsLocations && !value.originLocationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["originLocationId"],
        message: "Origin is required",
      })
    }
    if (needsLocations && !value.destinationLocationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["destinationLocationId"],
        message: "Destination is required",
      })
    }
    if (isTransport && value.pickupPoint.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pickupPoint"],
        message: "Pickup point is required",
      })
    }
    if (isTransport && value.dropoffPoint.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dropoffPoint"],
        message: "Drop-off point is required",
      })
    }
  })


export async function POST(req: Request) {
  const auth = await requireAuthenticatedUser()
  if ("error" in auth) return auth.error!

  const { supabase, user } = auth

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("clearance_level, is_active")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile || !allowedRoles.has(profile.clearance_level) || profile.is_active === false) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsedResult = quickSupplierSchema.safeParse(await req.json())
  if (!parsedResult.success) {
    return NextResponse.json(
      { error: "Invalid request payload", details: parsedResult.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const parsed = parsedResult.data
  const isTransport = parsed.kind === "transfers" || parsed.kind === "vehicle_rental"
  const needsLocations = parsed.kind === "train_operator" || parsed.kind === "airline"
  const autoDeriveName = parsed.kind === "train_operator"

  // Resolve location names needed for supplier.location and auto-derived route name.
  const locationIdsToFetch = Array.from(
    new Set(
      [
        parsed.locationId,
        needsLocations ? parsed.originLocationId : null,
        needsLocations ? parsed.destinationLocationId : null,
      ].filter((id): id is string => Boolean(id)),
    ),
  )

  let locationNameById = new Map<string, string>()
  if (locationIdsToFetch.length > 0) {
    const { data: locationRows } = await supabase
      .from("locations")
      .select("id, name")
      .in("id", locationIdsToFetch)
    for (const row of locationRows ?? []) {
      locationNameById.set(row.id, row.name)
    }
  }

  const supplierLocation = parsed.locationId
    ? (locationNameById.get(parsed.locationId) ?? "")
    : ""

  const effectiveRouteName = (() => {
    if (!autoDeriveName) return parsed.routeName.trim()
    const origin = parsed.originLocationId ? locationNameById.get(parsed.originLocationId) : undefined
    const dest = parsed.destinationLocationId ? locationNameById.get(parsed.destinationLocationId) : undefined
    return origin && dest ? buildRouteName(origin, dest, "one_way") : parsed.routeName.trim()
  })()

  // Use service client for all writes — the consultant role has no direct table write access.
  const adminSupabase = await createServiceClient()

  // Resolve a unique slug.
  const slugBase = buildSupplierSlugBase(parsed.name)
  const { data: slugRows } = await adminSupabase
    .from("suppliers")
    .select("slug")
    .or(`slug.eq.${slugBase},slug.like.${slugBase}-%`)

  const usedSlugs = new Set((slugRows ?? []).map((row) => row.slug))
  let slug = slugBase
  if (usedSlugs.has(slug)) {
    let suffix = 2
    while (usedSlugs.has(`${slugBase}-${suffix}`)) suffix++
    slug = `${slugBase}-${suffix}`
  }

  const now = new Date().toISOString()
  const routeId = crypto.randomUUID()
  const suiteTypeId = crypto.randomUUID()

  // Insert supplier as temporary.
  const { data: supplier, error: supplierError } = await adminSupabase
    .from("suppliers")
    .insert({
      kind: parsed.kind,
      name: parsed.name.trim(),
      slug,
      email: parsed.email || null,
      phone: parsed.phone || null,
      website: null,
      location: supplierLocation || null,
      location_id: parsed.locationId ?? null,
      notes: null,
      single_supplement_pct: 0,
      active: false,
      status: "temporary",
    })
    .select("*")
    .single()

  if (supplierError || !supplier) {
    if (supplierError?.code === "23505") {
      return NextResponse.json({ error: "A supplier with this name already exists." }, { status: 409 })
    }
    return NextResponse.json({ error: "Failed to create supplier" }, { status: 500 })
  }

  // Insert route.
  const { error: routeError } = await adminSupabase.from("routes").insert({
    id: routeId,
    supplier_id: supplier.id,
    name: effectiveRouteName,
    origin_location_id: needsLocations ? (parsed.originLocationId ?? null) : null,
    destination_location_id: needsLocations ? (parsed.destinationLocationId ?? null) : null,
    pickup_point: isTransport ? parsed.pickupPoint.trim() : null,
    dropoff_point: isTransport ? parsed.dropoffPoint.trim() : null,
    direction_mode: "one_way",
    active: true,
    created_at: now,
    updated_at: now,
  })

  if (routeError) {
    // Cleanup orphaned supplier — best-effort.
    await adminSupabase.from("suppliers").delete().eq("id", supplier.id)
    return NextResponse.json({ error: "Failed to create supplier route" }, { status: 500 })
  }

  // Insert suite type.
  const { error: suiteError } = await adminSupabase.from("suite_types").insert({
    id: suiteTypeId,
    supplier_id: supplier.id,
    name: parsed.suiteTypeName.trim(),
    active: true,
    sort_order: 0,
    created_at: now,
    updated_at: now,
  })

  if (suiteError) {
    await adminSupabase.from("suppliers").delete().eq("id", supplier.id)
    return NextResponse.json({ error: "Failed to create suite type" }, { status: 500 })
  }

  // Insert rate card.
  const { error: rateError } = await adminSupabase.from("rate_cards").insert({
    route_id: routeId,
    suite_type_id: suiteTypeId,
    price_per_person: parsed.price,
    child_price: null,
    infant_price: null,
    currency: "ZAR",
    valid_from: parsed.validFrom,
    valid_to: parsed.validTo ?? null,
    created_at: now,
  })

  if (rateError) {
    await adminSupabase.from("suppliers").delete().eq("id", supplier.id)
    return NextResponse.json({ error: "Failed to create rate card" }, { status: 500 })
  }

  return NextResponse.json(
    {
      supplier: mapSupplier(supplier),
      supplierId: supplier.id,
      slug: supplier.slug,
      supplierName: supplier.name,
      supplierKind: supplier.kind,
      routeId,
      routeName: effectiveRouteName,
      suiteTypeId,
      suiteTypeName: parsed.suiteTypeName.trim(),
    },
    { status: 201 },
  )
}
