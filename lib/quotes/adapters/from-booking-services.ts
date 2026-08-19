import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import {
  mapPackageDetail,
  type PackageLegRouteRow,
  type PackageLegWithSupplier,
  type PackageRow,
} from "@/lib/packages"
import { attachSuiteVariantVocab } from "@/lib/packages/suite-variant-vocab"
import { loadSupplierRateTiersResolver } from "@/lib/rate-types/load-supplier-rate-tiers"
import type { PackageDetail, SupplierKind } from "@/lib/types"
import type { PackageLegSelection, PackageUnitSelection } from "@/lib/quotes/build-from-package"
import { BASE_CURRENCY, normaliseCurrency } from "@/lib/money"

type BookingServiceRow = Database["public"]["Tables"]["booking_services"]["Row"]
type BookingServiceUnitRow = Database["public"]["Tables"]["booking_service_units"]["Row"]
type RouteRow = Database["public"]["Tables"]["routes"]["Row"]

interface SupplierJoin {
  name: string
  description: string | null
  kind: string
  pricing_mode: "rate_card" | "manual"
  base_rate_type_id: string | null
  quote_rate_type_id: string | null
}

interface BookingServiceWithSupplier extends BookingServiceRow {
  suppliers: SupplierJoin | SupplierJoin[] | null
}

function firstRecord<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value
}

export interface BookingServicesData {
  detail: PackageDetail
  services: BookingServiceRow[]
  units: BookingServiceUnitRow[]
}

/**
 * Loads a booking's services (Build Booking's per-booking equivalent of a catalogue package) and
 * shapes them into the same PackageDetail the pricing engine already consumes for catalogue
 * packages -- reusing mapPackageDetail/mapPackageLeg directly rather than re-deriving the
 * route/rate-card/suite-type eligibility rules a second time.
 *
 * Unlike a catalogue package, a booking-scoped build never curates which of a supplier's routes
 * apply to a leg (Build Booking always links every route the chosen supplier has), so there is no
 * real package_leg_routes join table backing this -- eligibility is synthesized here as "every
 * active route belonging to this service's supplier".
 */
export async function loadBookingServicesPackageDetail(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  bookingNumber: string,
  /** The currency the booking's quote is denominated in — carried onto the synthetic package so
   *  display-only consumers (e.g. the commission badge) render the right symbol. Supplier rates
   *  in other currencies still convert per line; this is not a pricing input. */
  quoteCurrency: string = BASE_CURRENCY,
): Promise<BookingServicesData> {
  const [{ data: serviceRows }, resolveSupplierRateTiers] = await Promise.all([
    supabase
      .from("booking_services")
      .select("*, suppliers(name, description, kind, pricing_mode, base_rate_type_id, quote_rate_type_id)")
      .eq("booking_id", bookingId)
      .order("sort_order", { ascending: true }),
    loadSupplierRateTiersResolver(supabase),
  ])

  const services = (serviceRows ?? []) as BookingServiceWithSupplier[]
  const serviceIds = services.map((service) => service.id)
  const supplierIds = Array.from(new Set(services.map((service) => service.supplier_id)))

  const [unitsResult, routesResult, suiteTypesResult] = await Promise.all([
    serviceIds.length > 0
      ? supabase.from("booking_service_units").select("*").in("service_id", serviceIds)
      : Promise.resolve({ data: [] as BookingServiceUnitRow[] }),
    supplierIds.length > 0
      ? supabase.from("routes").select("*").in("supplier_id", supplierIds).eq("active", true)
      : Promise.resolve({ data: [] as RouteRow[] }),
    supplierIds.length > 0
      ? supabase.from("suite_types").select("*").in("supplier_id", supplierIds).eq("active", true)
      : Promise.resolve({ data: [] }),
  ])

  const units = (unitsResult.data ?? []) as BookingServiceUnitRow[]
  const routes = (routesResult.data ?? []) as RouteRow[]
  const suiteTypes = suiteTypesResult.data ?? []
  const routeIds = routes.map((route) => route.id)

  // Tour-operator cards price the tour type and carry no route, so they are only reachable via
  // their suite type -- see lib/rate-cards/resolve.ts.
  const suiteTypeIds = suiteTypes.map((suiteType) => suiteType.id)
  const [routedRateCardsResult, typeRateCardsResult, vehicleRentalDetailsResult] = await Promise.all([
    routeIds.length > 0
      ? supabase.from("rate_cards").select("*").in("route_id", routeIds)
      : Promise.resolve({ data: [] }),
    suiteTypeIds.length > 0
      ? supabase.from("rate_cards").select("*").is("route_id", null).in("suite_type_id", suiteTypeIds)
      : Promise.resolve({ data: [] }),
    routeIds.length > 0
      ? supabase.from("vehicle_rental_route_details").select("*").in("route_id", routeIds)
      : Promise.resolve({ data: [] }),
  ])

  const locationIds = Array.from(
    new Set(
      routes
        .flatMap((route) => [route.origin_location_id, route.destination_location_id])
        .filter((id): id is string => Boolean(id)),
    ),
  )
  const { data: locationRows } =
    locationIds.length > 0
      ? await supabase.from("locations").select("id, name").in("id", locationIds)
      : { data: [] as { id: string; name: string }[] }
  const locationNameById = new Map((locationRows ?? []).map((row) => [row.id, row.name]))

  // Every active route belonging to a service's supplier is eligible for that service -- see
  // the doc comment above. mapPackageLeg needs one "link" row per (leg, route) pair to treat a
  // non-hotel leg's routes as eligible at all (an empty link set means zero eligible routes).
  const packageLegRoutes: PackageLegRouteRow[] = services.flatMap((service) =>
    routes
      .filter((route) => route.supplier_id === service.supplier_id)
      .map((route) => ({
        package_leg_id: service.id,
        route_id: route.id,
        created_at: service.created_at,
      })),
  )

  const legs: PackageLegWithSupplier[] = services.map((service) => {
    const supplier = firstRecord(service.suppliers)
    const supplierKind = (supplier?.kind as SupplierKind) ?? "train_operator"
    const rateTiers = resolveSupplierRateTiers({
      supplierId: service.supplier_id,
      baseRateTypeId: supplier?.base_rate_type_id ?? null,
      quoteRateTypeId: supplier?.quote_rate_type_id ?? null,
    })
    return {
      id: service.id,
      package_id: bookingId,
      supplier_id: service.supplier_id,
      label: service.label,
      sort_order: service.sort_order,
      // Not read by the pricing engine; Build Booking's own date-anchor derivation is unaffected
      // by this adapter (it works from booking_services.date_anchor directly, not this field).
      date_anchor: null,
      created_at: service.created_at,
      supplierName: supplier?.name ?? "Unknown supplier",
      supplierDescription: supplier?.description ?? null,
      supplierKind,
      supplierPricingMode: supplier?.pricing_mode ?? "rate_card",
      supplierBaseRateTypeId: rateTiers.baseRateTypeId,
      supplierQuoteRateTypeId: rateTiers.quoteRateTypeId,
      supplierInheritedRateTypeName: rateTiers.inheritedRateTypeName,
      supplierApplicableRateTypeIds: rateTiers.applicableRateTypeIds,
    }
  })

  const syntheticPackageRow: PackageRow = {
    id: bookingId,
    name: `Booking ${bookingNumber}`,
    slug: "",
    description: null,
    duration_nights: null,
    // Matches the fixed default Build Booking has always used for its hidden package
    // (app/api/jobs/[id]/build-booking/route.ts).
    single_supplement_pct: 50,
    fixed_price_per_person: null,
    currency: normaliseCurrency(quoteCurrency),
    active: false,
    created_at: services[0]?.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const detail = mapPackageDetail(
    syntheticPackageRow,
    legs,
    routes,
    packageLegRoutes,
    [...(routedRateCardsResult.data ?? []), ...(typeRateCardsResult.data ?? [])],
    suiteTypes,
    vehicleRentalDetailsResult.data ?? [],
    locationNameById,
  )

  // Without this vocab layering every suite type here would come back with no bedroom/bathroom
  // variant options, hiding those selectors from the Build Booking suite editor even when the
  // supplier has them.
  await attachSuiteVariantVocab(supabase, detail)

  return { detail, services, units }
}

/**
 * Maps booking_services + booking_service_units rows into the same PackageLegSelection[] shape
 * buildPackageQuoteLineItems already accepts for catalogue packages. Units with no resolved suite
 * type are dropped -- never invent a room for one that's still unknown (mirrors seedSelectionsForLegs).
 */
export function bookingServicesToLegSelections(
  services: readonly BookingServiceRow[],
  units: readonly BookingServiceUnitRow[],
): PackageLegSelection[] {
  const unitsByService = new Map<string, BookingServiceUnitRow[]>()
  for (const unit of units) {
    const list = unitsByService.get(unit.service_id) ?? []
    list.push(unit)
    unitsByService.set(unit.service_id, list)
  }

  return services.map((service) => {
    const serviceUnits = (unitsByService.get(service.id) ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)

    const unitSelections: PackageUnitSelection[] = serviceUnits
      .filter((unit): unit is BookingServiceUnitRow & { suite_type_id: string } => unit.suite_type_id !== null)
      .map((unit) => ({
        suiteTypeId: unit.suite_type_id,
        bedroomTypeId: unit.bedroom_type_id,
        bedroomLayoutId: unit.bedroom_layout_id,
        bathroomTypeId: unit.bathroom_type_id,
        adultCount: unit.adult_count,
        childCount: unit.child_count,
        infantCount: unit.infant_count,
        manualAdultPrice: unit.manual_adult_price,
        manualChildPrice: unit.manual_child_price,
        manualInfantPrice: unit.manual_infant_price,
        manualRoomPrice: unit.manual_room_price,
        // The setter's display name is resolved by the caller that has a Supabase client
        // (see lib/quotes/room-override-provenance.ts); this pure mapper only carries the stamp.
        manualRoomPriceSetAt: unit.manual_room_price_set_at,
        complimentaryFirstNight: unit.complimentary_first_night,
        manualTourPrice: unit.manual_tour_price,
        manualTourPriceSetAt: unit.manual_tour_price_set_at,
      }))

    const selection: PackageLegSelection = {
      legId: service.id,
      selected: service.selected,
      routeId: service.route_id ?? undefined,
      suiteTypeId: service.suite_type_id ?? undefined,
      rateTypeId: service.rate_type_id ?? undefined,
      serviceDate: service.service_date,
      routeReversed: service.route_reversed,
      units: unitSelections,
      nights: service.nights ?? undefined,
      // Only meaningful for manual-pricing legs and transfer/rental price overrides; a
      // rate-card leg takes its currency from the card instead and ignores this.
      priceCurrency: service.price_currency,
    }
    return selection
  })
}
