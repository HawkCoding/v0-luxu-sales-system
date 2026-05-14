import { NextResponse } from "next/server"
import { createSessionClient } from "@/lib/supabase/server"
import type { Database } from "@/lib/supabase/types"

export const allowedRoles = new Set(["admin", "manager"])

export type SessionClient = Awaited<ReturnType<typeof createSessionClient>>

type LocationRow = Database["public"]["Tables"]["locations"]["Row"]

export type RefTableName =
  | "rate_cards"
  | "routes"
  | "supplier_emails"
  | "suite_types"

export async function requireAuthenticatedUser() {
  const supabase = await createSessionClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      supabase,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }

  return { supabase, user }
}

export function makeUuid(): string {
  return crypto.randomUUID()
}

export function normalizeText(value: string): string | null {
  return value.trim() || null
}

export function normalizeNullableDate(value: string | null): string | null {
  return value && value.trim() ? value : null
}

export function buildErrorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function isUuid(value: string | null | undefined): value is string {
  if (!value) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
}

function isNoRowsError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "PGRST116"
  )
}

export async function queryExistingIds(
  supabase: SessionClient,
  table: RefTableName,
  ids: string[],
): Promise<string[]> {
  if (ids.length === 0) return []

  // Chunk ID lookups to avoid oversized query URLs for large IN clauses.
  const CHUNK_SIZE = 100
  const matchedIds: string[] = []

  for (let index = 0; index < ids.length; index += CHUNK_SIZE) {
    const idChunk = ids.slice(index, index + CHUNK_SIZE)
    const { data, error } = await supabase.from(table).select("id").in("id", idChunk)

    if (error) {
      throw new Error(`Failed to validate ids for ${table}`)
    }

    matchedIds.push(...(data ?? []).map((row) => row.id))
  }
  return matchedIds
}

export async function deleteInChunks(
  supabase: SessionClient,
  table: RefTableName,
  ids: string[],
): Promise<{ error: { message: string; code?: string } | null }> {
  if (ids.length === 0) return { error: null }

  // Chunk ID deletes to avoid oversized query URLs for large IN clauses.
  const CHUNK_SIZE = 100

  for (let index = 0; index < ids.length; index += CHUNK_SIZE) {
    const idChunk = ids.slice(index, index + CHUNK_SIZE)
    const { error } = await supabase.from(table).delete().in("id", idChunk)
    if (error) {
      return { error }
    }
  }

  return { error: null }
}

interface DeletionDependency {
  table: string
  ids: string[]
  referencedBy: string
}

export async function checkDeletionDependencies(
  supabase: SessionClient,
  routeIds: string[],
  suiteTypeIds: string[],
): Promise<DeletionDependency[]> {
  const conflicts: DeletionDependency[] = []

  if (routeIds.length > 0) {
    const bookingCheck = await supabase
      .from("bookings")
      .select("route_id", { count: "exact", head: false })
      .in("route_id", routeIds)
      .neq("stage", "closed")
      .neq("stage", "lost")

    const bookingRouteIds = Array.from(new Set((bookingCheck.data ?? []).map((r) => r.route_id)))
    if (bookingRouteIds.length > 0) {
      conflicts.push({ table: "routes", ids: bookingRouteIds.filter(Boolean) as string[], referencedBy: "bookings" })
    }
  }

  if (suiteTypeIds.length > 0) {
    const bookingSuiteCheck = await supabase
      .from("booking_suites")
      .select("suite_type_id", { count: "exact", head: false })
      .in("suite_type_id", suiteTypeIds)

    const referencedSuiteTypeIds = Array.from(
      new Set((bookingSuiteCheck.data ?? []).map((r) => r.suite_type_id)),
    )
    if (referencedSuiteTypeIds.length > 0) {
      conflicts.push({ table: "suite_types", ids: referencedSuiteTypeIds.filter(Boolean) as string[], referencedBy: "booking_suites" })
    }
  }

  return conflicts
}

export async function loadSupplierDetail(supabase: SessionClient, slug: string) {
  const supplierColumns = "id, slug, kind, status, name, email, phone, website, location, location_detail, location_id, location_area_id, description, notes, active, single_supplement_pct, default_time_start, default_time_end, created_at, updated_at"

  const slugLookup = await supabase
    .from("suppliers")
    .select(supplierColumns)
    .eq("slug", slug)
    .single()

  if (slugLookup.error && !isNoRowsError(slugLookup.error)) {
    console.error("Failed to load supplier by slug", { supplierSlug: slug, error: slugLookup.error })
    return {
      error: NextResponse.json({ error: "Failed to load supplier" }, { status: 500 }),
    }
  }

  let supplier = slugLookup.data
  if (!supplier && isUuid(slug)) {
    const idLookup = await supabase.from("suppliers").select(supplierColumns).eq("id", slug).single()
    if (idLookup.error && !isNoRowsError(idLookup.error)) {
      console.error("Failed to load supplier by legacy id", {
        supplierId: slug,
        error: idLookup.error,
      })
      return {
        error: NextResponse.json({ error: "Failed to load supplier" }, { status: 500 }),
      }
    }
    supplier = idLookup.data
  }

  if (!supplier) {
    return {
      error: NextResponse.json({ error: "Supplier not found" }, { status: 404 }),
    }
  }

  const supplierId = supplier.id
  const [
    { data: suiteTypes, error: suiteTypesError },
    { data: emails, error: emailsError },
    { data: routes, error: routesError },
  ] = await Promise.all([
    supabase
      .from("suite_types")
      .select("id, supplier_id, name, passenger_capacity, luggage_capacity, description, active, created_at, updated_at")
      .eq("supplier_id", supplierId)
      .order("name", { ascending: true }),
    supabase
      .from("supplier_emails")
      .select("id, supplier_id, email, label, created_at")
      .eq("supplier_id", supplierId)
      .order("label", { ascending: true })
      .order("email", { ascending: true }),
    supabase
      .from("routes")
      .select("id, supplier_id, name, origin_location_id, destination_location_id, pickup_point, dropoff_point, active, created_at, updated_at")
      .eq("supplier_id", supplierId)
      .order("name", { ascending: true }),
  ])

  if (suiteTypesError) {
    console.error("Failed to load supplier suite types", {
      supplierId,
      supplierSlug: slug,
      error: suiteTypesError,
    })
    return {
      error: NextResponse.json(
        { error: "Failed to load supplier suite types" },
        { status: 500 },
      ),
    }
  }

  if (emailsError) {
    console.error("Failed to load supplier emails", {
      supplierId,
      supplierSlug: slug,
      error: emailsError,
    })
    return {
      error: NextResponse.json(
        { error: "Failed to load supplier emails" },
        { status: 500 },
      ),
    }
  }

  if (routesError) {
    console.error("Failed to load supplier routes", { supplierId, supplierSlug: slug, error: routesError })
    return {
      error: NextResponse.json(
        { error: "Failed to load supplier routes" },
        { status: 500 },
      ),
    }
  }

  const routeIds = (routes ?? []).map((route) => route.id)
  const [rateCardResult, vehicleRentalDetailsResult] = await Promise.all([
    routeIds.length > 0
      ? supabase
          .from("rate_cards")
          .select("id, route_id, suite_type_id, price_per_person, child_price, infant_price, currency, valid_from, valid_to, created_at")
          .in("route_id", routeIds)
          .order("valid_from", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    routeIds.length > 0
      ? supabase
          .from("vehicle_rental_route_details")
          .select("route_id, included_km_per_day, extra_km_price, security_deposit, one_way_fee, created_at, updated_at")
          .in("route_id", routeIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  const { data: rateCards, error: rateCardsError } = rateCardResult
  const { data: vehicleRentalRouteDetails, error: vehicleRentalRouteDetailsError } =
    vehicleRentalDetailsResult
  if (rateCardsError) {
    console.error("Failed to load supplier rate cards", {
      supplierId,
      supplierSlug: slug,
      error: rateCardsError,
    })
    return {
      error: NextResponse.json(
        { error: "Failed to load supplier rate cards" },
        { status: 500 },
      ),
    }
  }

  if (vehicleRentalRouteDetailsError) {
    console.error("Failed to load vehicle rental route details", {
      supplierId,
      supplierSlug: slug,
      error: vehicleRentalRouteDetailsError,
    })
    return {
      error: NextResponse.json(
        { error: "Failed to load vehicle rental route details" },
        { status: 500 },
      ),
    }
  }

  const locationIds = Array.from(
    new Set(
      (routes ?? []).flatMap((route) => [
        route.origin_location_id,
        route.destination_location_id,
      ]),
    ),
  ).filter((locationId): locationId is string => Boolean(locationId))

  const locationResult:
    | { data: LocationRow[]; error: null }
    | { data: LocationRow[] | null; error: { message: string } | null } =
    locationIds.length > 0
      ? await supabase
          .from("locations")
          .select("id, name, country, parent_location_id, region_code, created_at, updated_at")
          .in("id", locationIds)
          .order("name", { ascending: true })
      : { data: [], error: null }

  const { data: locations, error: locationsError } = locationResult

  if (locationsError) {
    console.error("Failed to load supplier route locations", {
      supplierId,
      supplierSlug: slug,
      error: locationsError,
    })
    return {
      error: NextResponse.json(
        { error: "Failed to load route locations" },
        { status: 500 },
      ),
    }
  }

  return {
    supplier,
    suiteTypes: suiteTypes ?? [],
    emails: emails ?? [],
    routes: routes ?? [],
    rateCards: rateCards ?? [],
    locations: locations ?? [],
    vehicleRentalRouteDetails: vehicleRentalRouteDetails ?? [],
  }
}
