import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { computeLegPassengerTotals, distributePassengerTotals } from "@/lib/packages/passenger-totals"

const TRANSPORT_SUPPLIER_KINDS = new Set(["transfers", "vehicle_rental"])

type BookingServiceUnitInsert =
  Database["public"]["Tables"]["booking_service_units"]["Insert"]
type BookingTransportRequestInsert =
  Database["public"]["Tables"]["booking_transport_requests"]["Insert"]
type BookingVehicleRentalDetailInsert =
  Database["public"]["Tables"]["booking_vehicle_rental_details"]["Insert"]
type ServiceOrigin = Database["public"]["Enums"]["service_origin"]

export interface SeedLeg {
  id: string
  supplier_id: string
  kind: string | null
}

interface SeedOptions {
  tripStartDate: string | null
  tripEndDate: string | null
}

interface CapturedSuite {
  suiteTypeId: string
  bedroomTypeId: string | null
  bedroomLayoutId: string | null
  bathroomTypeId: string | null
}

/**
 * The suites captured on the enquiry, grouped by the supplier that owns each suite type, so a
 * service can pick up the ones belonging to its own supplier. Suites with no resolved suite
 * type are skipped -- there is nothing to carry, and a unit must not be invented for a room whose
 * type is still unknown.
 */
async function loadCapturedSuitesBySupplier(
  supabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<Map<string, CapturedSuite[]>> {
  const { data: suites } = await supabase
    .from("booking_suites")
    .select("suite_number, suite_type_id, bedroom_type_id, bedroom_layout_id, bathroom_type_id")
    .eq("booking_id", bookingId)
    .order("suite_number", { ascending: true })

  const resolved = (suites ?? []).filter(
    (suite): suite is typeof suite & { suite_type_id: string } => Boolean(suite.suite_type_id),
  )
  if (resolved.length === 0) return new Map()

  const { data: suiteTypes } = await supabase
    .from("suite_types")
    .select("id, supplier_id")
    .in("id", resolved.map((suite) => suite.suite_type_id))

  const supplierBySuiteTypeId = new Map(
    (suiteTypes ?? []).map((suiteType) => [suiteType.id, suiteType.supplier_id]),
  )

  const grouped = new Map<string, CapturedSuite[]>()
  for (const suite of resolved) {
    const supplierId = supplierBySuiteTypeId.get(suite.suite_type_id)
    if (!supplierId) continue

    const list = grouped.get(supplierId) ?? []
    list.push({
      suiteTypeId: suite.suite_type_id,
      bedroomTypeId: suite.bedroom_type_id,
      bedroomLayoutId: suite.bedroom_layout_id,
      bathroomTypeId: suite.bathroom_type_id,
    })
    grouped.set(supplierId, list)
  }

  return grouped
}

/**
 * The booking-level headcount a service's units have to add up to. Read once per seeding run and
 * re-bucketed per supplier, because the adult/child/infant boundary is supplier-scoped.
 */
async function loadBookingPassengerInputs(
  supabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<{ noOfAdults: number; noOfChildren: number; childAges: number[] }> {
  const { data } = await supabase
    .from("bookings")
    .select("no_of_adults, no_of_children, child_ages")
    .eq("id", bookingId)
    .maybeSingle()

  return {
    noOfAdults: data?.no_of_adults ?? 0,
    noOfChildren: data?.no_of_children ?? 0,
    childAges: data?.child_ages ?? [],
  }
}

/**
 * Seeds booking_service_units (+ blank booking_transport_requests) for newly-created
 * booking_services rows. There is no separate "selection" row to create -- a booking_services row
 * already is the leg and the selection, inserted directly by the caller before this runs.
 *
 * `origin` records whether this seeding happened as part of a human building the booking (Build
 * Booking, 'consultant') or the auto-build engine ('auto') -- see lib/auto-build. It is stamped
 * onto every unit/transport-request row this call creates.
 */
export async function seedUnitsForServices(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  services: SeedLeg[],
  { tripStartDate, tripEndDate }: SeedOptions,
  origin: ServiceOrigin = "consultant",
): Promise<{ error: string } | { error: null }> {
  if (services.length === 0) return { error: null }

  const unitServices = services.filter((service) => !TRANSPORT_SUPPLIER_KINDS.has(service.kind ?? ""))
  if (unitServices.length > 0) {
    const capturedSuitesBySupplier = await loadCapturedSuitesBySupplier(supabase, bookingId)
    // Carry the enquiry's headcount onto the units it just created. Without this every unit is
    // seeded 0/0/0 and the pricing engine rejects the leg ("per-unit passenger counts must sum
    // to the booking's traveller totals"), which is what left auto-built bookings unpriced.
    const passengerInputs = await loadBookingPassengerInputs(supabase, bookingId)

    const unitRows: BookingServiceUnitInsert[] = []
    for (const service of unitServices) {
      const captured = capturedSuitesBySupplier.get(service.supplier_id) ?? []
      const totals = await computeLegPassengerTotals(supabase, {
        ...passengerInputs,
        supplierId: service.supplier_id,
      })
      // A tour operator's units are independent activities the same travellers can all join, not
      // sleeping/seating slots -- so every unit gets the full headcount instead of a fractional
      // share (mirrors PASSENGER_SUM_SUPPLIER_KINDS in lib/packages/apply-dialog-state.ts, which
      // excludes tours from the "units must sum to the booking totals" rule this feeds).
      const isTour = service.kind === "tour_operator"
      // A supplier with no captured suites still gets its single bare unit -- give it the whole
      // headcount so it prices correctly the moment a suite type is chosen.
      const splits = distributePassengerTotals(totals, Math.max(1, captured.length))

      if (captured.length === 0) {
        unitRows.push({
          service_id: service.id,
          sort_order: 0,
          adult_count: splits[0].adultCount,
          child_count: splits[0].childCount,
          infant_count: splits[0].infantCount,
          origin,
        })
        continue
      }

      captured.forEach((suite, index) => {
        const split = isTour ? totals : splits[index]
        unitRows.push({
          service_id: service.id,
          suite_type_id: suite.suiteTypeId,
          bedroom_type_id: suite.bedroomTypeId,
          bedroom_layout_id: suite.bedroomLayoutId,
          bathroom_type_id: suite.bathroomTypeId,
          sort_order: index,
          adult_count: split.adultCount,
          child_count: split.childCount,
          infant_count: split.infantCount,
          origin,
        })
      })
    }

    if (unitRows.length > 0) {
      const { error: unitInsertError } = await supabase.from("booking_service_units").insert(unitRows)
      if (unitInsertError) return { error: unitInsertError.message }
    }
  }

  const transportServices = services.filter((service) => TRANSPORT_SUPPLIER_KINDS.has(service.kind ?? ""))

  if (transportServices.length > 0) {
    // Explicit resolution mirrors what the DB trigger (stamp_transport_request_pricing_basis)
    // would do anyway for a NULL value -- doing it here keeps this insert type-safe without
    // relying on trigger behaviour the caller can't see. Rentals are always per_vehicle.
    const transferSupplierIds = Array.from(
      new Set(
        transportServices
          .filter((service) => service.kind === "transfers")
          .map((service) => service.supplier_id),
      ),
    )
    const transferBasisBySupplierId = new Map<string, "per_vehicle" | "per_person">()
    if (transferSupplierIds.length > 0) {
      const { data: transferSuppliers } = await supabase
        .from("suppliers")
        .select("id, transfer_pricing_basis")
        .in("id", transferSupplierIds)
      for (const row of transferSuppliers ?? []) {
        transferBasisBySupplierId.set(row.id, row.transfer_pricing_basis)
      }
    }

    const transportRows: BookingTransportRequestInsert[] = transportServices.map((service) => ({
      booking_id: bookingId,
      service_id: service.id,
      supplier_id: service.supplier_id,
      service_type: service.kind === "vehicle_rental" ? "rental" : "transfer",
      pickup_point: "",
      dropoff_point: "",
      pickup_at: tripStartDate ? `${tripStartDate}T00:00:00+00:00` : null,
      sort_order: 0,
      pricing_basis:
        service.kind === "transfers"
          ? transferBasisBySupplierId.get(service.supplier_id) ?? "per_vehicle"
          : "per_vehicle",
    }))

    const { data: insertedTransportRows, error: transportInsertError } = await supabase
      .from("booking_transport_requests")
      .insert(transportRows)
      .select("id, service_type")

    if (transportInsertError) return { error: transportInsertError.message }

    const rentalDetailRows: BookingVehicleRentalDetailInsert[] = (insertedTransportRows ?? [])
      .filter((row) => row.service_type === "rental")
      .map((row) => ({
        transport_request_id: row.id,
        return_at: tripEndDate ? `${tripEndDate}T00:00:00+00:00` : null,
      }))

    if (rentalDetailRows.length > 0) {
      const { error: rentalInsertError } = await supabase
        .from("booking_vehicle_rental_details")
        .insert(rentalDetailRows)

      if (rentalInsertError) return { error: rentalInsertError.message }
    }
  }

  return { error: null }
}
