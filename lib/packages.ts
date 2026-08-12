import { formatDisplayDate, formatDisplayDateTime } from "@/lib/date-format"
import { normalizeRouteDirectionMode } from "@/lib/routes/route-name"
import { toHoursMinutes } from "@/lib/routes/route-schedule"
import type { Database } from "@/lib/supabase/types"
import type {
  PackageDetail,
  PackageLeg,
  SupplierKind,
  SupplierRateCard,
  SupplierRoute,
  SupplierSuiteType,
  VehicleRentalRouteDetails,
} from "@/lib/types"

/**
 * The mappers below once read the catalogue `packages` / `package_legs` /
 * `package_leg_routes` tables. Those tables are gone (see
 * 20260811140000_drop_catalogue_packages.sql) -- the shapes are now synthesized from
 * booking_services by lib/quotes/adapters/from-booking-services.ts, so they are declared here
 * rather than derived from Database. Field names stay snake_case to match what the adapter
 * builds and what the pricing engine downstream still reads.
 */
export interface PackageRow {
  id: string
  name: string
  slug: string
  description: string | null
  duration_nights: number | null
  single_supplement_pct: number
  fixed_price_per_person: number | null
  currency: string
  active: boolean
  created_at: string
  updated_at: string
}

export interface PackageLegRow {
  id: string
  package_id: string
  supplier_id: string
  label: string | null
  sort_order: number
  date_anchor: string | null
  created_at: string
}

export interface PackageLegRouteRow {
  package_leg_id: string
  route_id: string
  created_at: string
}

type RateCardRow = Database["public"]["Tables"]["rate_cards"]["Row"]
type RouteRow = Database["public"]["Tables"]["routes"]["Row"]
type SuiteTypeRow = Database["public"]["Tables"]["suite_types"]["Row"]
type VehicleRentalRouteDetailsRow = Database["public"]["Tables"]["vehicle_rental_route_details"]["Row"]

export interface PackageLegWithSupplier extends PackageLegRow {
  supplierName: string
  supplierDescription: string | null
  supplierKind: SupplierKind
  supplierPricingMode: "rate_card" | "manual"
  /** Already resolved via loadSupplierRateTiersResolver -- not the raw supplier columns. */
  supplierBaseRateTypeId: string | null
  supplierQuoteRateTypeId: string | null
  /** Name of the rate type an un-chosen leg will inherit: the quoted rate, else the base rate. */
  supplierInheritedRateTypeName: string | null
}

function mapVehicleRentalRouteDetails(
  row: VehicleRentalRouteDetailsRow | null | undefined,
): VehicleRentalRouteDetails | null {
  if (!row) return null

  return {
    routeId: row.route_id,
    includedKmPerDay: row.included_km_per_day ?? null,
    extraKmPrice: row.extra_km_price ?? null,
    securityDeposit: row.security_deposit ?? null,
    oneWayFee: row.one_way_fee ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function normalizeLegDateAnchor(value: string | null | undefined): "pre" | "post" | null {
  return value === "pre" || value === "post" ? value : null
}

export function mapPackageRoute(
  row: RouteRow,
  vehicleRentalDetails?: VehicleRentalRouteDetailsRow | null,
  locationNameById?: Map<string, string>,
): SupplierRoute {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    name: row.name,
    originLocationId: row.origin_location_id ?? null,
    destinationLocationId: row.destination_location_id ?? null,
    originLocationName: row.origin_location_id
      ? locationNameById?.get(row.origin_location_id) ?? null
      : null,
    destinationLocationName: row.destination_location_id
      ? locationNameById?.get(row.destination_location_id) ?? null
      : null,
    pickupPoint: row.pickup_point ?? null,
    dropoffPoint: row.dropoff_point ?? null,
    vehicleRentalDetails: mapVehicleRentalRouteDetails(vehicleRentalDetails),
    directionMode: normalizeRouteDirectionMode(row.direction_mode),
    // Train routes carry their length here; hotel post-stay dates are derived from it.
    durationDays: row.duration_days ?? null,
    departureTime: toHoursMinutes(row.departure_time),
    arrivalTime: toHoursMinutes(row.arrival_time),
    returnDepartureTime: toHoursMinutes(row.return_departure_time),
    returnArrivalTime: toHoursMinutes(row.return_arrival_time),
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
    rateTypeId: row.rate_type_id,
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
  vehicleRentalRouteDetails: VehicleRentalRouteDetailsRow[] = [],
  locationNameById?: Map<string, string>,
): PackageLeg {
  const detailsByRouteId = new Map(
    vehicleRentalRouteDetails.map((details) => [details.route_id, details]),
  )
  const linkedRouteIds = new Set(
    packageLegRoutes
      .filter((link) => link.package_leg_id === row.id)
      .map((link) => link.route_id),
  )
  const hasLinkedRoutes = linkedRouteIds.size > 0
  const eligibleRoutes =
    row.supplierKind === "hotel_property" && !hasLinkedRoutes
      ? routes
      : routes.filter((route) => linkedRouteIds.has(route.id))
  const legRouteIds = new Set(eligibleRoutes.map((route) => route.id))

  return {
    id: row.id,
    packageId: row.package_id,
    supplierId: row.supplier_id,
    supplierName: row.supplierName,
    supplierDescription: row.supplierDescription,
    supplierKind: row.supplierKind,
    pricingMode: row.supplierPricingMode,
    label: row.label,
    sortOrder: row.sort_order,
    dateAnchor: normalizeLegDateAnchor(row.date_anchor),
    baseRateTypeId: row.supplierBaseRateTypeId ?? null,
    quoteRateTypeId: row.supplierQuoteRateTypeId ?? null,
    inheritedRateTypeName: row.supplierInheritedRateTypeName ?? null,
    routes: eligibleRoutes.map((route) =>
      mapPackageRoute(route, detailsByRouteId.get(route.id), locationNameById),
    ),
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
  vehicleRentalRouteDetails: VehicleRentalRouteDetailsRow[] = [],
  locationNameById?: Map<string, string>,
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
          vehicleRentalRouteDetails,
          locationNameById,
        ),
      ),
  }
}
