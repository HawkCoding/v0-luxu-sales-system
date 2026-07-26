import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

export const TRANSPORT_SUPPLIER_KINDS = new Set(["transfers", "vehicle_rental"])

type BookingPackageSelectionInsert =
  Database["public"]["Tables"]["booking_package_selections"]["Insert"]
type BookingPackageSelectionUnitInsert =
  Database["public"]["Tables"]["booking_package_selection_units"]["Insert"]
type BookingTransportRequestInsert =
  Database["public"]["Tables"]["booking_transport_requests"]["Insert"]
type BookingVehicleRentalDetailInsert =
  Database["public"]["Tables"]["booking_vehicle_rental_details"]["Insert"]

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
 * package leg can pick up the ones belonging to its own supplier. Suites with no resolved suite
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

/** Fan out a package's legs into booking_package_selections (+ units seeded from the enquiry) and
 * booking_transport_requests (+ blank rental details) for a booking. Shared by the
 * predefined-package assign flow and the Build Booking (hidden-package) flow. */
export async function seedSelectionsForLegs(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  legs: SeedLeg[],
  { tripStartDate, tripEndDate }: SeedOptions,
): Promise<{ error: string } | { error: null }> {
  if (legs.length === 0) return { error: null }

  const rows: BookingPackageSelectionInsert[] = legs.map((leg) => ({
    booking_id: bookingId,
    package_leg_id: leg.id,
    selected: true,
    supplier_id: leg.supplier_id,
    service_date: tripStartDate,
  }))

  const { data: insertedSelections, error: insertError } = await supabase
    .from("booking_package_selections")
    .insert(rows)
    .select("id, package_leg_id")

  if (insertError) return { error: insertError.message }

  // Seed units per non-transport leg. Where the enquiry already captured a suite for this leg's
  // supplier, carry its suite type AND configuration across -- otherwise the bedroom/layout/
  // bathroom values captured at intake would be silently dropped at the point they finally
  // matter, since booking_package_selection_units is what quote build and the voucher read.
  const selectionIdByLegId = new Map((insertedSelections ?? []).map((row) => [row.package_leg_id, row.id]))
  const unitLegs = legs.filter((leg) => !TRANSPORT_SUPPLIER_KINDS.has(leg.kind ?? ""))
  if (unitLegs.length > 0) {
    const capturedSuitesBySupplier = await loadCapturedSuitesBySupplier(supabase, bookingId)

    const unitRows: BookingPackageSelectionUnitInsert[] = unitLegs.flatMap((leg) => {
      const selectionId = selectionIdByLegId.get(leg.id)
      if (!selectionId) return []

      const captured = capturedSuitesBySupplier.get(leg.supplier_id) ?? []
      if (captured.length === 0) {
        return [{ selection_id: selectionId, sort_order: 0 }]
      }

      return captured.map((suite, index) => ({
        selection_id: selectionId,
        suite_type_id: suite.suiteTypeId,
        bedroom_type_id: suite.bedroomTypeId,
        bedroom_layout_id: suite.bedroomLayoutId,
        bathroom_type_id: suite.bathroomTypeId,
        sort_order: index,
      }))
    })

    if (unitRows.length > 0) {
      const { error: unitInsertError } = await supabase
        .from("booking_package_selection_units")
        .insert(unitRows)

      if (unitInsertError) return { error: unitInsertError.message }
    }
  }

  const transportLegs = legs.filter((leg) => TRANSPORT_SUPPLIER_KINDS.has(leg.kind ?? ""))

  if (transportLegs.length > 0) {
    const transportRows: BookingTransportRequestInsert[] = transportLegs.map((leg) => ({
      booking_id: bookingId,
      package_leg_id: leg.id,
      supplier_id: leg.supplier_id,
      service_type: leg.kind === "vehicle_rental" ? "rental" : "transfer",
      pickup_point: "",
      dropoff_point: "",
      pickup_at: tripStartDate ? `${tripStartDate}T00:00:00+00:00` : null,
      sort_order: 0,
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
