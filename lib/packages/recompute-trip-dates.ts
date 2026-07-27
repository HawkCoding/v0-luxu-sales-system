import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import {
  dateOnly,
  deriveTripDateRange,
  serviceDateSpan,
  type ServiceDateSpan,
} from "@/lib/packages/trip-date-range"

/**
 * Re-derives bookings.trip_start_date / trip_end_date from the booking's dated services and
 * persists them. Called after any write to package selections or transport requests, so the
 * trip range stays correct no matter which dialog (or API client) edited the services.
 *
 * `package_travel_date` is kept in sync with the derived start for legacy read paths.
 *
 * `departure_date` — the enquiry-time scalar that vouchers/itineraries and pricing read
 * directly — is also re-synced to the derived start, but only when a start exists: a package
 * whose legs aren't dated yet keeps its enquiry-time departure rather than being nulled (which
 * would trip the departure_date_missing voucher-readiness gate).
 */
export async function recomputeBookingTripDates(
  supabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<{ error: string | null }> {
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, package_id")
    .eq("id", bookingId)
    .maybeSingle()

  if (bookingError) return { error: bookingError.message }
  if (!booking) return { error: "Booking not found" }

  const spans: ServiceDateSpan[] = []

  interface DatedRow {
    selected: boolean
    service_date: string | null
    nights: number | null
    route_id: string | null
    kind: string | null
  }
  const datedRows: DatedRow[] = []

  if (booking.package_id) {
    const { data: selections, error: selectionsError } = await supabase
      .from("booking_package_selections")
      .select("selected, service_date, nights, route_id, leg:package_legs(supplier:suppliers(kind))")
      .eq("booking_id", bookingId)

    if (selectionsError) return { error: selectionsError.message }

    for (const row of selections ?? []) {
      datedRows.push({
        selected: row.selected,
        service_date: row.service_date,
        nights: row.nights,
        route_id: row.route_id,
        kind: row.leg?.supplier?.kind ?? null,
      })
    }
  }

  // Build Booking's per-booking equivalent — a booking uses one or the other, never both.
  const { data: services, error: servicesError } = await supabase
    .from("booking_services")
    .select("selected, service_date, nights, route_id, suppliers(kind)")
    .eq("booking_id", bookingId)

  if (servicesError) return { error: servicesError.message }

  for (const row of services ?? []) {
    const supplier = Array.isArray(row.suppliers) ? row.suppliers[0] : row.suppliers
    datedRows.push({
      selected: row.selected,
      service_date: row.service_date,
      nights: row.nights,
      route_id: row.route_id,
      kind: supplier?.kind ?? null,
    })
  }

  if (datedRows.length > 0) {
    const selectedRows = datedRows.filter((row) => row.selected)

    const routeIds = Array.from(
      new Set(selectedRows.map((row) => row.route_id).filter((v): v is string => Boolean(v))),
    )
    const durationByRouteId = new Map<string, number | null>()
    if (routeIds.length > 0) {
      const { data: routes, error: routesError } = await supabase
        .from("routes")
        .select("id, duration_days")
        .in("id", routeIds)

      if (routesError) return { error: routesError.message }
      for (const route of routes ?? []) durationByRouteId.set(route.id, route.duration_days)
    }

    for (const row of selectedRows) {
      const kind = row.kind
      // Transfer/rental legs are dated by their transport requests below, not by service_date.
      if (!kind || kind === "transfers" || kind === "vehicle_rental") continue
      const span = serviceDateSpan({
        supplierKind: kind,
        serviceDate: row.service_date,
        nights: row.nights,
        routeDurationDays: row.route_id ? durationByRouteId.get(row.route_id) ?? null : null,
      })
      if (span) spans.push(span)
    }
  }

  const { data: transportRows, error: transportError } = await supabase
    .from("booking_transport_requests")
    .select("pickup_at, rental_details:booking_vehicle_rental_details(return_at)")
    .eq("booking_id", bookingId)

  if (transportError) return { error: transportError.message }

  for (const row of transportRows ?? []) {
    const rental = Array.isArray(row.rental_details) ? row.rental_details[0] : row.rental_details
    const pickup = dateOnly(row.pickup_at)
    const returnDate = dateOnly(rental?.return_at)
    const start = pickup ?? returnDate
    if (!start) continue
    const end = returnDate && returnDate >= start ? returnDate : start
    spans.push({ start, end })
  }

  // A booking with no services (catalogue or Build Booking) and no dated transport keeps
  // whatever trip dates it has — don't clobber them from an unrelated transport edit.
  if (!booking.package_id && datedRows.length === 0 && spans.length === 0) return { error: null }

  const range = deriveTripDateRange(spans)

  const updates: Database["public"]["Tables"]["bookings"]["Update"] = {
    trip_start_date: range.start,
    trip_end_date: range.end,
    package_travel_date: range.start,
  }
  // Keep the doc/pricing departure in sync with the legs; never null a known
  // enquiry-time date just because the legs aren't dated yet.
  if (range.start) updates.departure_date = range.start

  const { error: updateError } = await supabase
    .from("bookings")
    .update(updates)
    .eq("id", bookingId)

  if (updateError) return { error: updateError.message }
  return { error: null }
}
