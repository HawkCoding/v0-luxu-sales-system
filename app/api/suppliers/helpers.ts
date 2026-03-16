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

export async function loadSupplierDetail(supabase: SessionClient, id: string) {
  const [
    { data: supplier, error: supplierError },
    { data: packages, error: packagesError },
    { data: suiteTypes, error: suiteTypesError },
  ] = await Promise.all([
    supabase.from("suppliers").select("*").eq("id", id).single(),
    supabase
      .from("packages")
      .select("*")
      .eq("supplier_id", id)
      .order("name", { ascending: true }),
    supabase
      .from("suite_types")
      .select("*")
      .eq("supplier_id", id)
      .order("name", { ascending: true }),
  ])

  if (supplierError || !supplier) {
    if (supplierError) {
      console.error("Failed to load supplier", { supplierId: id, error: supplierError })
    }
    return {
      error: NextResponse.json({ error: "Supplier not found" }, { status: 404 }),
    }
  }

  if (packagesError) {
    console.error("Failed to load supplier packages", { supplierId: id, error: packagesError })
    return {
      error: NextResponse.json(
        { error: "Failed to load supplier packages" },
        { status: 500 },
      ),
    }
  }

  if (suiteTypesError) {
    console.error("Failed to load supplier suite types", {
      supplierId: id,
      error: suiteTypesError,
    })
    return {
      error: NextResponse.json(
        { error: "Failed to load supplier suite types" },
        { status: 500 },
      ),
    }
  }

  const packageIds = (packages ?? []).map((pkg) => pkg.id)

  const [
    { data: routes, error: routesError },
    { data: rateCards, error: rateCardsError },
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
          .from("rate_cards")
          .select("*")
          .in("package_id", packageIds)
          .order("valid_from", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ])

  if (routesError || rateCardsError) {
    if (routesError) {
      console.error("Failed to load supplier routes", { supplierId: id, error: routesError })
    }
    if (rateCardsError) {
      console.error("Failed to load supplier rate cards", { supplierId: id, error: rateCardsError })
    }
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
    console.error("Failed to load supplier route locations", {
      supplierId: id,
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
    packages: packages ?? [],
    routes: routes ?? [],
    suiteTypes: suiteTypes ?? [],
    rateCards: rateCards ?? [],
    locations: locations ?? [],
  }
}
