import { NextResponse } from "next/server"
import { createSessionClient } from "@/lib/supabase/server"
import type { Database } from "@/lib/supabase/types"

export const allowedRoles = new Set(["admin", "manager"])

export type SessionClient = Awaited<ReturnType<typeof createSessionClient>>

type LocationRow = Database["public"]["Tables"]["locations"]["Row"]

export type RefTableName =
  | "packages"
  | "rate_cards"
  | "routes"
  | "supplier_pricing_options"
  | "supplier_seasonal_periods"
  | "supplier_seasonal_prices"
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

export async function queryExistingIds(
  supabase: SessionClient,
  table: RefTableName,
  ids: string[],
): Promise<string[]> {
  if (ids.length === 0) return []

  const { data, error } = await supabase.from(table).select("id").in("id", ids)

  if (error) {
    throw new Error(`Failed to validate ids for ${table}`)
  }

  return (data ?? []).map((row) => row.id)
}

interface SupplierDeletionDependencyCheckInput {
  packageIds: string[]
  routeIds: string[]
  suiteTypeIds: string[]
}

export async function getSupplierDeletionBlocker(
  supabase: SessionClient,
  input: SupplierDeletionDependencyCheckInput,
): Promise<string | null> {
  const { packageIds, routeIds, suiteTypeIds } = input

  if (packageIds.length > 0) {
    const [{ count: bookingCount, error: bookingError }, { count: offersCount, error: offersError }] =
      await Promise.all([
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .in("package_id", packageIds),
        supabase
          .from("hotel_offers")
          .select("id", { count: "exact", head: true })
          .in("package_id", packageIds),
      ])

    if (bookingError || offersError) {
      throw new Error("Failed to validate package dependencies")
    }

    if ((bookingCount ?? 0) > 0 || (offersCount ?? 0) > 0) {
      return "Cannot remove package records linked to existing bookings or offers."
    }
  }

  if (routeIds.length > 0) {
    const { count: routeBookingCount, error: routeBookingError } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .in("route_id", routeIds)

    if (routeBookingError) {
      throw new Error("Failed to validate route dependencies")
    }

    if ((routeBookingCount ?? 0) > 0) {
      return "Cannot remove route records linked to existing bookings."
    }
  }

  if (suiteTypeIds.length > 0) {
    const { count: suiteTypeBookingCount, error: suiteTypeBookingError } = await supabase
      .from("booking_suites")
      .select("id", { count: "exact", head: true })
      .in("suite_type_id", suiteTypeIds)

    if (suiteTypeBookingError) {
      throw new Error("Failed to validate suite type dependencies")
    }

    if ((suiteTypeBookingCount ?? 0) > 0) {
      return "Cannot remove suite type records linked to existing bookings."
    }
  }

  return null
}

export async function loadSupplierDetail(supabase: SessionClient, id: string) {
  const [
    { data: supplier, error: supplierError },
    { data: pricingOptions, error: pricingError },
    { data: packages, error: packagesError },
    { data: seasonalPeriods, error: seasonalPeriodsError },
  ] = await Promise.all([
    supabase.from("suppliers").select("*").eq("id", id).single(),
    supabase
      .from("supplier_pricing_options")
      .select("*")
      .eq("supplier_id", id)
      .order("is_primary", { ascending: false })
      .order("name", { ascending: true }),
    supabase
      .from("packages")
      .select("*")
      .eq("supplier_id", id)
      .order("name", { ascending: true }),
    supabase
      .from("supplier_seasonal_periods")
      .select("*")
      .eq("supplier_id", id)
      .order("valid_from", { ascending: true }),
  ])

  if (supplierError || !supplier) {
    return {
      error: NextResponse.json({ error: "Supplier not found" }, { status: 404 }),
    }
  }

  if (pricingError) {
    return {
      error: NextResponse.json(
        { error: "Failed to load supplier pricing" },
        { status: 500 },
      ),
    }
  }

  if (packagesError) {
    return {
      error: NextResponse.json(
        { error: "Failed to load supplier packages" },
        { status: 500 },
      ),
    }
  }

  if (seasonalPeriodsError) {
    return {
      error: NextResponse.json(
        { error: "Failed to load supplier seasonal periods" },
        { status: 500 },
      ),
    }
  }

  const packageIds = (packages ?? []).map((pkg) => pkg.id)
  const periodIds = (seasonalPeriods ?? []).map((period) => period.id)

  const [
    { data: routes, error: routesError },
    { data: suiteTypes, error: suiteTypesError },
    { data: rateCards, error: rateCardsError },
    { data: seasonalPrices, error: seasonalPricesError },
  ] = await Promise.all([
    packageIds.length > 0
      ? supabase
          .from("routes")
          .select("*")
          .in("package_id", packageIds)
          .order("name", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    packageIds.length > 0
      ? supabase
          .from("suite_types")
          .select("*")
          .in("package_id", packageIds)
          .order("name", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    packageIds.length > 0
      ? supabase
          .from("rate_cards")
          .select("*")
          .in("package_id", packageIds)
          .order("valid_from", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    periodIds.length > 0
      ? supabase
          .from("supplier_seasonal_prices")
          .select("*")
          .in("period_id", periodIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (routesError || suiteTypesError || rateCardsError || seasonalPricesError) {
    return {
      error: NextResponse.json(
        { error: "Failed to load supplier reference data" },
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
  )

  const locationResult:
    | { data: LocationRow[]; error: null }
    | { data: LocationRow[] | null; error: { message: string } | null } =
    locationIds.length > 0
      ? await supabase
          .from("locations")
          .select("*")
          .in("id", locationIds)
          .order("name", { ascending: true })
      : { data: [], error: null }

  const { data: locations, error: locationsError } = locationResult

  if (locationsError) {
    return {
      error: NextResponse.json(
        { error: "Failed to load route locations" },
        { status: 500 },
      ),
    }
  }

  return {
    supplier,
    pricingOptions: pricingOptions ?? [],
    packages: packages ?? [],
    routes: routes ?? [],
    suiteTypes: suiteTypes ?? [],
    rateCards: rateCards ?? [],
    seasonalPeriods: seasonalPeriods ?? [],
    seasonalPrices: seasonalPrices ?? [],
    locations: locations ?? [],
  }
}
