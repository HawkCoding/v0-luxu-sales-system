import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { mapPackageDetail, type PackageLegWithSupplier } from "@/lib/packages"
import type { PackageDetail, SupplierKind } from "@/lib/types"
import type { PackageLegSelection, PackageUnitSelection } from "@/lib/quotes/build-from-package"

type BookingServiceRow = Database["public"]["Tables"]["booking_services"]["Row"]
type BookingServiceUnitRow = Database["public"]["Tables"]["booking_service_units"]["Row"]
type PackageRow = Database["public"]["Tables"]["packages"]["Row"]
type PackageLegRouteRow = Database["public"]["Tables"]["package_leg_routes"]["Row"]
type RouteRow = Database["public"]["Tables"]["routes"]["Row"]

interface BookingServiceWithSupplier extends BookingServiceRow {
  suppliers: { name: string; description: string | null; kind: string } | { name: string; description: string | null; kind: string }[] | null
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
): Promise<BookingServicesData> {
  const { data: serviceRows } = await supabase
    .from("booking_services")
    .select("*, suppliers(name, description, kind)")
    .eq("booking_id", bookingId)
    .order("sort_order", { ascending: true })

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

  const [rateCardsResult, vehicleRentalDetailsResult] = await Promise.all([
    routeIds.length > 0
      ? supabase.from("rate_cards").select("*").in("route_id", routeIds)
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
      supplierKind: (supplier?.kind as SupplierKind) ?? "train_operator",
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
    markup_pct: 0,
    currency: "ZAR",
    active: false,
    created_at: services[0]?.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const detail = mapPackageDetail(
    syntheticPackageRow,
    legs,
    routes,
    packageLegRoutes,
    rateCardsResult.data ?? [],
    suiteTypes,
    vehicleRentalDetailsResult.data ?? [],
    locationNameById,
  )

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
    }
    return selection
  })
}
