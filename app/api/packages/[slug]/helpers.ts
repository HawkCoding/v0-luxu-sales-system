import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  buildPackageSlugBase,
  mapPackageDetail,
  type PackageLegWithSupplier,
} from "@/lib/packages"
import type { Database } from "@/lib/supabase/types"
import {
  loadSupplierDefaultRateTypeResolver,
  type SupplierDefaultRateTypeResolver,
} from "@/lib/rate-types/load-supplier-defaults"
import { getSupplierVocabulary, isTransportSupplier, type SupplierKind } from "@/lib/types"
import type { SessionClient } from "../../suppliers/helpers"
import type { UpsertPackageInput } from "../schemas"

type PackageLegRow = Database["public"]["Tables"]["package_legs"]["Row"]
type PackageLegRouteInsert = Database["public"]["Tables"]["package_leg_routes"]["Insert"]
type PackageRow = Database["public"]["Tables"]["packages"]["Row"]
type RateCardInsert = Database["public"]["Tables"]["rate_cards"]["Insert"]
type RouteInsert = Database["public"]["Tables"]["routes"]["Insert"]

interface SupplierJoin {
  name: string
  description: string | null
  kind: SupplierKind
  pricing_mode: "rate_card" | "manual"
  default_rate_type_id: string | null
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
  resolveSupplierDefaultRateTypeId: SupplierDefaultRateTypeResolver,
): PackageLegWithSupplier[] {
  return (rows ?? []).map((row) => {
    const supplierKind = row.suppliers?.kind ?? "train_operator"
    return {
      id: row.id,
      package_id: row.package_id,
      supplier_id: row.supplier_id,
      label: row.label,
      sort_order: row.sort_order,
      date_anchor: row.date_anchor,
      created_at: row.created_at,
      supplierName: row.suppliers?.name ?? "Unknown supplier",
      supplierDescription: row.suppliers?.description ?? null,
      supplierKind,
      supplierPricingMode: row.suppliers?.pricing_mode ?? "rate_card",
      supplierDefaultRateTypeId: resolveSupplierDefaultRateTypeId(
        supplierKind,
        row.suppliers?.default_rate_type_id ?? null,
      ),
    }
  })
}

export async function loadPackageDetail(supabase: SupabaseClient<Database>, slug: string) {
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

  const [{ data: legRows, error: legsError }, resolveSupplierDefaultRateTypeId] = await Promise.all([
    supabase
      .from("package_legs")
      .select("*, suppliers(name, description, kind, pricing_mode, default_rate_type_id)")
      .eq("package_id", pkg.id)
      .order("sort_order", { ascending: true }),
    loadSupplierDefaultRateTypeResolver(supabase),
  ])

  if (legsError) {
    return {
      error: NextResponse.json({ error: "Failed to load package legs" }, { status: 500 }),
    }
  }

  const legs = normalizeLegRows(
    (legRows ?? []) as PackageLegJoinRow[],
    resolveSupplierDefaultRateTypeId,
  )
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
  const [rateCardsResult, vehicleRentalDetailsResult] = await Promise.all([
    routeIds.length > 0
      ? supabase
          .from("rate_cards")
          .select("*")
          .in("route_id", routeIds)
          .order("valid_from", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    routeIds.length > 0
      ? supabase
          .from("vehicle_rental_route_details")
          .select("*")
          .in("route_id", routeIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  const { data: rateCards, error: rateCardsError } = rateCardsResult
  const { data: vehicleRentalRouteDetails, error: vehicleRentalDetailsError } =
    vehicleRentalDetailsResult

  // Endpoint names for rendering the booked travel direction (origin → destination) on documents.
  const locationIds = Array.from(
    new Set(
      (routes ?? []).flatMap((route) =>
        [route.origin_location_id, route.destination_location_id].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    ),
  )
  const { data: locationRows, error: locationsError } =
    locationIds.length > 0
      ? await supabase.from("locations").select("id, name").in("id", locationIds)
      : { data: [], error: null }
  const locationNameById = new Map((locationRows ?? []).map((row) => [row.id, row.name]))

  if (locationsError) {
    return {
      error: NextResponse.json(
        { error: "Failed to load package reference data" },
        { status: 500 },
      ),
    }
  }
  if (rateCardsError) {
    return {
      error: NextResponse.json(
        { error: "Failed to load package reference data" },
        { status: 500 },
      ),
    }
  }

  if (vehicleRentalDetailsError) {
    return {
      error: NextResponse.json(
        { error: "Failed to load package reference data" },
        { status: 500 },
      ),
    }
  }

  const detail = mapPackageDetail(
    pkg,
    legs,
    routes ?? [],
    packageLegRoutes ?? [],
    rateCards ?? [],
    suiteTypes ?? [],
    vehicleRentalRouteDetails ?? [],
    locationNameById,
  )

  await attachSuiteVariantVocab(supabase, detail)

  return {
    packageRow: pkg as PackageRow,
    legs,
    packageLegRoutes: packageLegRoutes ?? [],
    detail,
  }
}

/** Populates each leg's suite types with the bedroom type / bedroom layout / bathroom type
 * options they're associated with (for the package-apply unit picker's dropdowns) — the base
 * suite_types query doesn't carry this, it's a separate M:N vocabulary layered on afterward. */
export async function attachSuiteVariantVocab(
  supabase: SupabaseClient<Database>,
  detail: ReturnType<typeof mapPackageDetail>,
): Promise<void> {
  const suiteTypeIds = Array.from(
    new Set(detail.legs.flatMap((leg) => leg.suiteTypes.map((suiteType) => suiteType.id))),
  )
  if (suiteTypeIds.length === 0) return

  const [bedroomTypesResult, bedroomLayoutsResult, bathroomTypesResult] = await Promise.all([
    supabase
      .from("suite_type_bedroom_types")
      .select("suite_type_id, bedroom_types(id, name)")
      .in("suite_type_id", suiteTypeIds),
    supabase
      .from("suite_type_bedroom_layouts")
      .select("suite_type_id, bedroom_layouts(id, name)")
      .in("suite_type_id", suiteTypeIds),
    supabase
      .from("suite_type_bathroom_types")
      .select("suite_type_id, bathroom_types(id, name)")
      .in("suite_type_id", suiteTypeIds),
  ])

  function groupBy<TKey extends string>(
    rows: { suite_type_id: string }[] | null | undefined,
    key: TKey,
  ): Map<string, { id: string; name: string }[]> {
    const result = new Map<string, { id: string; name: string }[]>()
    for (const row of rows ?? []) {
      const value = (row as unknown as Record<TKey, { id: string; name: string } | null>)[key]
      if (!value) continue
      const list = result.get(row.suite_type_id) ?? []
      list.push(value)
      result.set(row.suite_type_id, list)
    }
    return result
  }

  const bedroomTypesBySuiteType = groupBy(bedroomTypesResult.data, "bedroom_types")
  const bedroomLayoutsBySuiteType = groupBy(bedroomLayoutsResult.data, "bedroom_layouts")
  const bathroomTypesBySuiteType = groupBy(bathroomTypesResult.data, "bathroom_types")

  for (const leg of detail.legs) {
    for (const suiteType of leg.suiteTypes) {
      const bedroomTypes = bedroomTypesBySuiteType.get(suiteType.id) ?? []
      const bedroomLayouts = bedroomLayoutsBySuiteType.get(suiteType.id) ?? []
      const bathroomTypes = bathroomTypesBySuiteType.get(suiteType.id) ?? []
      suiteType.bedroomTypeIds = bedroomTypes.map((v) => v.id)
      suiteType.bedroomTypes = bedroomTypes.map((v) => v.name)
      suiteType.bedroomLayoutIds = bedroomLayouts.map((v) => v.id)
      suiteType.bedroomLayouts = bedroomLayouts.map((v) => v.name)
      suiteType.bathroomTypeIds = bathroomTypes.map((v) => v.id)
      suiteType.bathroomTypes = bathroomTypes.map((v) => v.name)
    }
  }
}

export async function loadSupplierKinds(
  supabase: SessionClient,
  supplierIds: string[],
): Promise<Map<string, SupplierKind>> {
  if (supplierIds.length === 0) return new Map()
  const { data } = await supabase
    .from("suppliers")
    .select("id, kind")
    .in("id", supplierIds)
  return new Map((data ?? []).map((row) => [row.id, row.kind as SupplierKind]))
}

export function normalizePackageChildren(
  packageId: string,
  parsed: UpsertPackageInput,
  kindBySupplierId?: Map<string, SupplierKind>,
) {
  const now = new Date().toISOString()
  const legs = parsed.legs.map((leg, index) => {
    const legId = leg.id ?? makeUuid()
    // Kinds whose route editor has no location fields (hotels, tour operators)
    // and transport kinds (pickup/drop-off text instead) must never persist
    // location links — stray ids invisibly block location deletion.
    const kind = kindBySupplierId?.get(leg.supplierId)
    const routeUsesLocations = kind
      ? getSupplierVocabulary(kind).routeHasLocations && !isTransportSupplier(kind)
      : true
    const routeRows = leg.routes.map((route) => {
      const id = route.id ?? makeUuid()
      const insert: RouteInsert = {
        id,
        supplier_id: leg.supplierId,
        name: route.name.trim(),
        origin_location_id: routeUsesLocations ? route.originLocationId ?? null : null,
        destination_location_id: routeUsesLocations ? route.destinationLocationId ?? null : null,
        pickup_point: route.pickupPoint?.trim() || null,
        dropoff_point: route.dropoffPoint?.trim() || null,
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
        // Only hotels hang off the train's dates; an anchor on any other kind is meaningless.
        date_anchor: kind === "hotel_property" ? leg.dateAnchor ?? null : null,
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
