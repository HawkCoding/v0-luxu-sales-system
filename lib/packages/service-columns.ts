// The booking_services (+ booking_service_units) column list shared by both reads in
// app/api/jobs/[id]/services/route.ts: Build Booking's step-2 hydration (GET) and the PATCH
// reload response.
//
// Pulled out to a plain module, rather than kept private in route.ts, so a test can assert this
// string actually carries every manual_* override column route.ts writes -- a route.ts file can
// only export HTTP method handlers (App Router), so the constant itself was unreachable from a
// test. F-P1-3: manual_tour_price/manual_tour_price_set_at were written by the PATCH's unitRows
// insert but silently absent from this select, so a tour leg's override never survived reopening
// Build Booking -- and nothing caught it, because nothing could read the select string to check.
export const SERVICES_WITH_UNITS_SELECT =
  "id, booking_id, supplier_id, route_id, route_reversed, suite_type_id, service_date, nights, date_anchor, rate_type_id, notes, selected, origin, sort_order, price_currency, updated_at, " +
  "departure_time, arrival_date, arrival_time, flight_number, departure_airport_code, arrival_airport_code, hand_luggage_kg, checked_luggage_kg, " +
  "luggage_storage_available, accommodation_pricing_basis, booking_date, confirmation_date, payment_made_date, paid_with, " +
  "units:booking_service_units(id, suite_type_id, bedroom_type_id, bedroom_layout_id, bathroom_type_id, adult_count, child_count, infant_count, sort_order, manual_adult_price, manual_child_price, manual_infant_price, manual_room_price, manual_room_price_set_at, manual_tour_price, manual_tour_price_set_at, complimentary_first_night, rate_type_id)"

/**
 * GET only. Build Booking's step 1 lists a booking's services by supplier name and kind, which is
 * all it renders -- so carrying the name/kind here lets the dialog paint that list off this read
 * instead of waiting on the far heavier GET /build-booking payload (every route, rate card and
 * suite type for every supplier on the booking) that step 2 actually needs.
 *
 * Deliberately separate from SERVICES_WITH_UNITS_SELECT so PATCH's reload response keeps its
 * existing shape -- a read-path speedup has no business changing what a write returns.
 */
export const SERVICES_WITH_SUPPLIER_SELECT = `${SERVICES_WITH_UNITS_SELECT}, suppliers(name, kind)`

/** Every booking_service_units column a manual price override can live in, on either the room
 *  (hotel) or tour axis. Used to assert SERVICES_WITH_UNITS_SELECT never drops one again. */
export const MANUAL_OVERRIDE_UNIT_COLUMNS = [
  "manual_adult_price",
  "manual_child_price",
  "manual_infant_price",
  "manual_room_price",
  "manual_room_price_set_at",
  "manual_tour_price",
  "manual_tour_price_set_at",
] as const
