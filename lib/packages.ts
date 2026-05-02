import { formatDisplayDate, formatDisplayDateTime } from "@/lib/date-format"
import type { Database } from "@/lib/supabase/types"
import type {
  Package,
  PackageDetail,
  PackageLeg,
  SupplierKind,
  SupplierRateCard,
  SupplierRoute,
  SupplierSuiteType,
} from "@/lib/types"

type PackageRow = Database["public"]["Tables"]["packages"]["Row"]
type PackageLegRow = Database["public"]["Tables"]["package_legs"]["Row"]
type PackageLegRouteRow = Database["public"]["Tables"]["package_leg_routes"]["Row"]
type RateCardRow = Database["public"]["Tables"]["rate_cards"]["Row"]
type RouteRow = Database["public"]["Tables"]["routes"]["Row"]
type SuiteTypeRow = Database["public"]["Tables"]["suite_types"]["Row"]

export interface PackageLegWithSupplier extends PackageLegRow {
  supplierName: string
  supplierKind: SupplierKind
}

export function buildPackageSlugBase(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return slug || "package"
}

export function mapPackageListItem(
  row: PackageRow,
  legs: PackageLegWithSupplier[],
  prices: number[],
  trainRouteName: string | null,
): Package {
  const priceFrom = prices.length > 0 ? Math.min(...prices) : null
  const priceTo = prices.length > 0 ? Math.max(...prices) : null
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    durationNights: row.duration_nights,
    currency: row.currency,
    active: row.active,
    legCount: legs.length,
    supplierKinds: Array.from(new Set(legs.map((leg) => leg.supplierKind))),
    priceFrom: priceFrom === priceTo ? null : priceFrom,
    priceTo: priceFrom === priceTo ? priceFrom : priceTo,
    trainRouteName,
    fixedPricePerPerson: row.fixed_price_per_person ?? null,
  }
}

export function mapPackageRoute(row: RouteRow): SupplierRoute {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    name: row.name,
    originLocationId: row.origin_location_id ?? null,
    destinationLocationId: row.destination_location_id ?? null,
    transportServiceType: row.transport_service_type ?? null,
    pickupPoint: row.pickup_point ?? null,
    dropoffPoint: row.dropoff_point ?? null,
    includedKmPerDay: row.included_km_per_day ?? null,
    extraKmPrice: row.extra_km_price ?? null,
    securityDeposit: row.security_deposit ?? null,
    oneWayFee: row.one_way_fee ?? null,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdAtDisplay: formatDisplayDateTime(row.created_at),
    updatedAtDisplay: formatDisplayDateTime(row.updated_at),
  }
}

export function mapPackageRateCard(row: RateCardRow): SupplierRateCard {
  return {
    id: row.id,
    routeId: row.route_id,
    suiteTypeId: row.suite_type_id,
    pricePerPerson: row.price_per_person,
    childPrice: row.child_price,
    infantPrice: row.infant_price,
    currency: row.currency,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    createdAt: row.created_at,
    validFromDisplay: formatDisplayDate(row.valid_from),
    validToDisplay: row.valid_to ? formatDisplayDate(row.valid_to) : undefined,
    createdAtDisplay: formatDisplayDateTime(row.created_at),
  }
}

export function mapPackageSuiteType(row: SuiteTypeRow): SupplierSuiteType {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    name: row.name,
    passengerCapacity: row.passenger_capacity ?? null,
    luggageCapacity: row.luggage_capacity ?? null,
    description: row.description ?? null,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdAtDisplay: formatDisplayDateTime(row.created_at),
    updatedAtDisplay: formatDisplayDateTime(row.updated_at),
  }
}

export function mapPackageLeg(
  row: PackageLegWithSupplier,
  routes: RouteRow[],
  packageLegRoutes: PackageLegRouteRow[],
  rateCards: RateCardRow[],
  suiteTypes: SuiteTypeRow[],
): PackageLeg {
  const linkedRouteIds = new Set(
    packageLegRoutes
      .filter((link) => link.package_leg_id === row.id)
      .map((link) => link.route_id),
  )
  const eligibleRoutes =
    row.supplierKind === "hotel_property"
      ? routes
      : routes.filter((route) => linkedRouteIds.has(route.id))
  const legRouteIds = new Set(eligibleRoutes.map((route) => route.id))

  return {
    id: row.id,
    packageId: row.package_id,
    supplierId: row.supplier_id,
    supplierName: row.supplierName,
    supplierKind: row.supplierKind,
    label: row.label,
    sortOrder: row.sort_order,
    routes: eligibleRoutes.map(mapPackageRoute),
    rateCards: rateCards
      .filter((rateCard) => legRouteIds.has(rateCard.route_id))
      .map(mapPackageRateCard),
    suiteTypes: suiteTypes.map(mapPackageSuiteType),
  }
}

export function mapPackageDetail(
  row: PackageRow,
  legs: PackageLegWithSupplier[],
  routes: RouteRow[],
  packageLegRoutes: PackageLegRouteRow[],
  rateCards: RateCardRow[],
  suiteTypes: SuiteTypeRow[],
): PackageDetail {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    durationNights: row.duration_nights,
    singleSupplementPct: row.single_supplement_pct,
    fixedPricePerPerson: row.fixed_price_per_person ?? null,
    currency: row.currency,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdAtDisplay: formatDisplayDateTime(row.created_at),
    updatedAtDisplay: formatDisplayDateTime(row.updated_at),
    legs: legs
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((leg) =>
        mapPackageLeg(
          leg,
          routes.filter((route) => route.supplier_id === leg.supplier_id),
          packageLegRoutes,
          rateCards,
          suiteTypes.filter((suiteType) => suiteType.supplier_id === leg.supplier_id),
        ),
      ),
  }
}
