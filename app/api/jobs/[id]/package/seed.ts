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

/** Fan out a package's legs into booking_package_selections (+ blank units) and
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

  // Seed one blank unit per non-transport leg so the UI has a row to fill in immediately.
  const selectionIdByLegId = new Map((insertedSelections ?? []).map((row) => [row.package_leg_id, row.id]))
  const unitLegs = legs.filter((leg) => !TRANSPORT_SUPPLIER_KINDS.has(leg.kind ?? ""))
  if (unitLegs.length > 0) {
    const unitRows: BookingPackageSelectionUnitInsert[] = unitLegs
      .map((leg) => selectionIdByLegId.get(leg.id))
      .filter((selectionId): selectionId is string => Boolean(selectionId))
      .map((selectionId) => ({ selection_id: selectionId, sort_order: 0 }))

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
