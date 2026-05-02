import { NextResponse } from "next/server"
import {
  buildPackageSlugBase,
  mapPackageDetail,
  type PackageLegWithSupplier,
} from "@/lib/packages"
import type { Database } from "@/lib/supabase/types"
import type { SupplierKind } from "@/lib/types"
import type { SessionClient } from "../../suppliers/helpers"
import type { UpsertPackageInput } from "../schemas"

type PackageLegRow = Database["public"]["Tables"]["package_legs"]["Row"]
type PackageLegRouteInsert = Database["public"]["Tables"]["package_leg_routes"]["Insert"]
type PackageRow = Database["public"]["Tables"]["packages"]["Row"]
type RateCardInsert = Database["public"]["Tables"]["rate_cards"]["Insert"]
type RouteInsert = Database["public"]["Tables"]["routes"]["Insert"]

interface SupplierJoin {
  name: string
  kind: SupplierKind
}

interface PackageLegJoinRow extends PackageLegRow {
  suppliers: SupplierJoin | null
}

export function makeUuid(): string {
  return crypto.randomUUID()
}

export function normalizeNullableDate(value: string | null): string | null {
  return value && value.trim() ? value : null
}

export async function hasPackageWriteAccess(supabase: SessionClient, userId: string) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("clearance_level")
    .eq("user_id", userId)
    .single()

  return !error && Boolean(profile && ["admin", "manager"].includes(profile.clearance_level))
}

export async function resolveUniquePackageSlug(
  supabase: SessionClient,
  packageName: string,
  existingPackageId?: string,
): Promise<string> {
  const slugBase = buildPackageSlugBase(packageName)
  const { data: slugRows, error } = await supabase
    .from("packages")
    .select("id, slug")
    .or(`slug.eq.${slugBase},slug.like.${slugBase}-%`)

  if (error) {
    throw new Error("Failed to validate package slug uniqueness")
  }

  const usedSlugs = new Set(
    (slugRows ?? [])
      .filter((row) => row.id !== existingPackageId)
      .map((row) => row.slug),
  )
  if (!usedSlugs.has(slugBase)) {
    return slugBase
  }

  let suffix = 2
  while (usedSlugs.has(`${slugBase}-${suffix}`)) {
    suffix += 1
  }

  return `${slugBase}-${suffix}`
}

function normalizeLegRows(
  rows: PackageLegJoinRow[] | null,
): PackageLegWithSupplier[] {
  return (rows ?? []).map((row) => ({
    id: row.id,
    package_id: row.package_id,
    supplier_id: row.supplier_id,
    label: row.label,
    sort_order: row.sort_order,
    created_at: row.created_at,
    supplierName: row.suppliers?.name ?? "Unknown supplier",
    supplierKind: row.suppliers?.kind ?? "train_operator",
  }))
}

export async function loadPackageDetail(supabase: SessionClient, slug: string) {
  const { data: pkg, error: packageError } = await supabase
    .from("packages")
    .select("*")
    .eq("slug", slug)
    .single()

  if (packageError || !pkg) {
    if (packageError?.code === "PGRST116") {
      return {
        error: NextResponse.json({ error: "Package not found" }, { status: 404 }),
      }
    }

    return {
      error: NextResponse.json({ error: "Failed to load package" }, { status: 500 }),
    }
  }

  const { data: legRows, error: legsError } = await supabase
    .from("package_legs")
    .select("*, suppliers(name, kind)")
    .eq("package_id", pkg.id)
    .order("sort_order", { ascending: true })

  if (legsError) {
    return {
      error: NextResponse.json({ error: "Failed to load package legs" }, { status: 500 }),
    }
  }

  const legs = normalizeLegRows((legRows ?? []) as PackageLegJoinRow[])
  const legIds = legs.map((leg) => leg.id)
  const supplierIds = Array.from(new Set(legs.map((leg) => leg.supplier_id)))

  const [
    { data: routes, error: routesError },
    { data: suiteTypes, error: suiteTypesError },
    { data: packageLegRoutes, error: packageLegRoutesError },
  ] = await Promise.all([
    supplierIds.length > 0
      ? supabase
          .from("routes")
          .select("*")
          .in("supplier_id", supplierIds)
          .order("name", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    supplierIds.length > 0
      ? supabase
          .from("suite_types")
          .select("*")
          .in("supplier_id", supplierIds)
          .eq("active", true)
          .order("name", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    legIds.length > 0
      ? supabase
          .from("package_leg_routes")
          .select("*")
          .in("package_leg_id", legIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (routesError || suiteTypesError || packageLegRoutesError) {
    return {
      error: NextResponse.json(
        { error: "Failed to load package reference data" },
        { status: 500 },
      ),
    }
  }

  const routeIds = (routes ?? []).map((route) => route.id)
  const { data: rateCards, error: rateCardsError } =
    routeIds.length > 0
      ? await supabase
          .from("rate_cards")
          .select("*")
          .in("route_id", routeIds)
          .order("valid_from", { ascending: true })
      : { data: [], error: null }

  if (rateCardsError) {
    return {
      error: NextResponse.json(
        { error: "Failed to load package reference data" },
        { status: 500 },
      ),
    }
  }

  return {
    packageRow: pkg as PackageRow,
    legs,
    packageLegRoutes: packageLegRoutes ?? [],
    detail: mapPackageDetail(
      pkg,
      legs,
      routes ?? [],
      packageLegRoutes ?? [],
      rateCards ?? [],
      suiteTypes ?? [],
    ),
  }
}

export function normalizePackageChildren(
  packageId: string,
  parsed: UpsertPackageInput,
) {
  const now = new Date().toISOString()
  const legs = parsed.legs.map((leg, index) => {
    const legId = leg.id ?? makeUuid()
    const routeRows = leg.routes.map((route) => {
      const id = route.id ?? makeUuid()
      const insert: RouteInsert = {
        id,
        supplier_id: leg.supplierId,
        name: route.name.trim(),
        origin_location_id: route.originLocationId ?? null,
        destination_location_id: route.destinationLocationId ?? null,
        transport_service_type: route.transportServiceType ?? null,
        pickup_point: route.pickupPoint?.trim() || null,
        dropoff_point: route.dropoffPoint?.trim() || null,
        included_km_per_day: route.includedKmPerDay ?? null,
        extra_km_price: route.extraKmPrice ?? null,
        security_deposit: route.securityDeposit ?? null,
        one_way_fee: route.oneWayFee ?? null,
        active: route.active,
        created_at: now,
        updated_at: now,
      }
      return { insert, existing: route.existing }
    })
    const routeIds = new Set(
      routeRows
        .map((row) => row.insert.id)
        .filter((id): id is string => typeof id === "string"),
    )
    const rateCardRows = leg.rateCards.map((rateCard) => {
      if (!rateCard.routeId || !routeIds.has(rateCard.routeId)) {
        throw new Error("Each rate card must reference a route from the same leg.")
      }

      const insert: RateCardInsert = {
        id: rateCard.id ?? makeUuid(),
        route_id: rateCard.routeId,
        suite_type_id: rateCard.suiteTypeId,
        price_per_person: rateCard.pricePerPerson,
        child_price: rateCard.childPrice ?? null,
        infant_price: rateCard.infantPrice ?? null,
        currency:
          rateCard.currency.trim().toUpperCase() ||
          parsed.currency.trim().toUpperCase() ||
          "ZAR",
        valid_from: rateCard.validFrom,
        valid_to: normalizeNullableDate(rateCard.validTo),
        created_at: now,
      }
      return { insert, existing: rateCard.existing }
    })

    const routeLinks: PackageLegRouteInsert[] =
      leg.routes.length > 0
        ? Array.from(routeIds).map((routeId) => ({
            package_leg_id: legId,
            route_id: routeId,
            created_at: now,
          }))
        : []

    return {
      leg: {
        id: legId,
        package_id: packageId,
        supplier_id: leg.supplierId,
        label: leg.label?.trim() || null,
        sort_order: leg.sortOrder ?? index,
        created_at: now,
      },
      routeRows,
      rateCardRows,
      routeLinks,
    }
  })

  const allRouteRows = legs.flatMap((entry) => entry.routeRows)
  const allRateCardRows = legs.flatMap((entry) => entry.rateCardRows)

  return {
    legs: legs.map((entry) => entry.leg),
    routeLinks: legs.flatMap((entry) => entry.routeLinks),
    routes: allRouteRows.filter((row) => !row.existing).map((row) => row.insert),
    rateCards: allRateCardRows.filter((row) => !row.existing).map((row) => row.insert),
    allRouteIds: allRouteRows.map((row) => row.insert.id),
    allRateCardIds: allRateCardRows.map((row) => row.insert.id),
  }
}
