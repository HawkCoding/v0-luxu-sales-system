import type { Database } from "@/lib/supabase/types"
import type {
  Location,
  Supplier,
  SupplierDetail,
  SupplierPackage,
  SupplierPricingOption,
  SupplierRateCard,
  SupplierRoute,
  SupplierSeasonalPeriod,
  SupplierSeasonalPrice,
  SupplierSuiteType,
} from "@/lib/types"

type LocationRow = Database["public"]["Tables"]["locations"]["Row"]
type PackageRow = Database["public"]["Tables"]["packages"]["Row"]
type RateCardRow = Database["public"]["Tables"]["rate_cards"]["Row"]
type RouteRow = Database["public"]["Tables"]["routes"]["Row"]
type SupplierRow = Database["public"]["Tables"]["suppliers"]["Row"]
type SupplierPricingOptionRow = Database["public"]["Tables"]["supplier_pricing_options"]["Row"]
type SupplierSeasonalPeriodRow =
  Database["public"]["Tables"]["supplier_seasonal_periods"]["Row"]
type SupplierSeasonalPriceRow =
  Database["public"]["Tables"]["supplier_seasonal_prices"]["Row"]
type SuiteTypeRow = Database["public"]["Tables"]["suite_types"]["Row"]

function normalizeSupplierStatus(value: string): Supplier["status"] {
  if (value === "draft" || value === "active" || value === "inactive") {
    return value
  }
  return "inactive"
}

export function mapSupplier(row: SupplierRow): Supplier {
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    status: normalizeSupplierStatus(row.status),
    name: row.name,
    email: row.email,
    phone: row.phone,
    website: row.website,
    location: row.location,
    notes: row.notes,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapSupplierPricingOption(
  row: SupplierPricingOptionRow,
): SupplierPricingOption {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    name: row.name,
    singlePrice: row.single_price,
    doublePrice: row.double_price,
    familyPrice: row.family_price,
    currency: row.currency,
    isPrimary: row.is_primary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapLocation(row: LocationRow): Location {
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    regionCode: row.region_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapSupplierRoute(row: RouteRow): SupplierRoute {
  return {
    id: row.id,
    packageId: row.package_id,
    name: row.name,
    originLocationId: row.origin_location_id,
    destinationLocationId: row.destination_location_id,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapSupplierSuiteType(row: SuiteTypeRow): SupplierSuiteType {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    name: row.name,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapSupplierRateCard(row: RateCardRow): SupplierRateCard {
  return {
    id: row.id,
    packageId: row.package_id,
    routeId: row.route_id,
    suiteTypeId: row.suite_type_id,
    pricePerPerson: row.price_per_person,
    currency: row.currency,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    createdAt: row.created_at,
  }
}

export function mapSupplierPackage(
  row: PackageRow,
  routes: RouteRow[],
  rateCards: RateCardRow[],
): SupplierPackage {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    name: row.name,
    description: row.description,
    durationNights: row.duration_nights,
    singleSupplementPct: row.single_supplement_pct,
    currency: row.currency,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    routes: routes.map(mapSupplierRoute),
    rateCards: rateCards.map(mapSupplierRateCard),
  }
}

export function mapSupplierSeasonalPrice(
  row: SupplierSeasonalPriceRow,
): SupplierSeasonalPrice {
  return {
    id: row.id,
    periodId: row.period_id,
    optionId: row.option_id,
    singlePrice: row.single_price,
    doublePrice: row.double_price,
    familyPrice: row.family_price,
    createdAt: row.created_at,
  }
}

export function mapSupplierSeasonalPeriod(
  row: SupplierSeasonalPeriodRow,
  prices: SupplierSeasonalPriceRow[],
): SupplierSeasonalPeriod {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    label: row.label,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    createdAt: row.created_at,
    prices: prices.map(mapSupplierSeasonalPrice),
  }
}

export function mapSupplierDetail(
  supplier: SupplierRow,
  packages: PackageRow[],
  routes: RouteRow[],
  suiteTypes: SuiteTypeRow[],
  rateCards: RateCardRow[],
  locations: LocationRow[],
): SupplierDetail {
  return {
    ...mapSupplier(supplier),
    suiteTypes: suiteTypes.map(mapSupplierSuiteType),
    packages: packages.map((pkg) =>
      mapSupplierPackage(
        pkg,
        routes.filter((route) => route.package_id === pkg.id),
        rateCards.filter((rateCard) => rateCard.package_id === pkg.id),
      ),
    ),
    locations: locations.map(mapLocation),
  }
}
