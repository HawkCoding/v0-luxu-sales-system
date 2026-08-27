import { NextResponse } from "next/server"
import { z } from "zod"
import { mapSupplier } from "@/lib/suppliers"
import { getHotelDefaultTimes } from "@/lib/suppliers/hotel-default-times"
import { buildRouteName } from "@/lib/routes/route-name"
import { isTypePricedSupplier } from "@/lib/types"
import { requireAuthenticatedUser, resolveUniqueSupplierSlug, supplierConflictMessage } from "../helpers"
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

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsedResult = quickSupplierSchema.safeParse(rawBody)
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
  // Tour operators price the tour type, so the route created here is the itinerary that describes
  // it and the rate card hangs off the type alone.
  const isItineraryKind = isTypePricedSupplier(parsed.kind)

  // Resolve location names needed for the auto-derived route name.
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

  const effectiveRouteName = (() => {
    const clientName = parsed.routeName.trim()
    if (!autoDeriveName || clientName.length > 0) return clientName
    const origin = parsed.originLocationId ? locationNameById.get(parsed.originLocationId) : undefined
    const dest = parsed.destinationLocationId ? locationNameById.get(parsed.destinationLocationId) : undefined
    return origin && dest ? buildRouteName(origin, dest, "one_way") : clientName
  })()

  // Use service client for all writes — the consultant role has no direct table write access.
  const adminSupabase = await createServiceClient()

  // Resolve a unique slug using the session client (no elevated privileges needed).
  const slug = await resolveUniqueSupplierSlug(supabase, parsed.name, parsed.kind)

  const now = new Date().toISOString()
  const routeId = crypto.randomUUID()
  const suiteTypeId = crypto.randomUUID()

  const hotelDefaultTimes =
    parsed.kind === "hotel_property" ? await getHotelDefaultTimes(supabase) : null

  // Insert supplier as temporary.
  const { data: supplier, error: supplierError } = await adminSupabase
    .from("suppliers")
    .insert({
      kind: parsed.kind,
      // Matches the default POST /api/suppliers applies -- airfare can't be maintained as a
      // standing rate list, so a quick-added airline still starts manually-priced. The quick-add
      // form itself still collects a one-off rate card below; see the price/validFrom fields
      // further down, which apply regardless of pricing_mode (pre-existing quick-add behaviour,
      // unchanged here).
      pricing_mode: parsed.kind === "airline" ? "manual" : "rate_card",
      name: parsed.name.trim(),
      slug,
      email: parsed.email || null,
      phone: parsed.phone || null,
      website: null,
      // Free text is train-only (a train has no single city); the quick-add dialog never collects
      // it, so this always starts null and only the full supplier editor can set it.
      location: null,
      location_id: parsed.locationId ?? null,
      notes: null,
      single_supplement_pct: 0,
      default_time_start: hotelDefaultTimes?.checkIn ?? null,
      default_time_end: hotelDefaultTimes?.checkOut ?? null,
      active: false,
      status: "temporary",
    })
    .select("id, slug, kind, pricing_mode, transfer_pricing_basis, status, name, email, phone, website, location, location_id, location_area_id, description, notes, active, single_supplement_pct, infant_max_age, child_max_age, default_time_start, default_time_end, inclusions, exclusions, street_address, emergency_phone, default_contact_name, parent_supplier_id, long_journey_min_days, train_only_note, quote_suite_detail, created_at, updated_at")
    .single()

  if (supplierError || !supplier) {
    if (supplierError?.code === "23505") {
      return NextResponse.json(
        { error: supplierConflictMessage(supplierError, parsed.name.trim(), parsed.kind) },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: "Failed to create supplier" }, { status: 500 })
  }

  // Insert suite type first: a tour operator's route links back to it.
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

  // Insert route.
  const { error: routeError } = await adminSupabase.from("routes").insert({
    id: routeId,
    supplier_id: supplier.id,
    name: effectiveRouteName,
    suite_type_id: isItineraryKind ? suiteTypeId : null,
    origin_location_id: needsLocations ? (parsed.originLocationId ?? null) : null,
    destination_location_id: needsLocations ? (parsed.destinationLocationId ?? null) : null,
    pickup_point: isTransport ? parsed.pickupPoint.trim() : null,
    dropoff_point: isTransport ? parsed.dropoffPoint.trim() : null,
    direction_mode: "one_way",
    duration_days: null,
    active: true,
    created_at: now,
    updated_at: now,
  })

  if (routeError) {
    // Cleanup orphaned supplier — best-effort.
    await adminSupabase.from("suppliers").delete().eq("id", supplier.id)
    return NextResponse.json({ error: "Failed to create supplier route" }, { status: 500 })
  }

  // Insert rate card. Tour operators price the tour type, so the card carries no itinerary.
  const { error: rateError } = await adminSupabase.from("rate_cards").insert({
    route_id: isItineraryKind ? null : routeId,
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
