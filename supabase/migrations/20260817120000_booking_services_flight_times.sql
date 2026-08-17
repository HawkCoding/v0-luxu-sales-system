-- Per-booking flight schedule, on the priced leg itself.
--
-- An airline supplier reaches a quote as a booking_services row with manual per-cabin fares in
-- booking_service_units (see 20260729100000_booking_services.sql). Until now that row carried only
-- `service_date` -- a bare calendar day -- so a client-facing quote could say what day the client
-- flies but never at what time, and a voucher fell back to the supplier's `default_time_start`,
-- which is meaningless for an airline: every booking is a different flight.
--
-- Why here and not on booking_transport_requests/booking_flight_details (which already model
-- cabin/airports/arrival_at): the booking_services row IS the leg. Quote line items snapshot
-- pricing_snapshot.legId -> booking_services.id, and every quote-scoped read
-- (resolveAcceptedQuoteScope -> buildVoucherServiceBlocks legIds, loadLegReferenceRows) filters on
-- that id. Splitting the price and the schedule across two rows joined by service_id would let the
-- whole-set replace in replace_booking_transport_requests delete the schedule of a leg the client
-- has already paid for. booking_flight_details stays in place, untouched, for legacy rows.
--
-- Departure date stays `service_date` -- there is exactly one departure day and it is already the
-- key every date rule, trip-range recompute and rate-card lookup reads. Arrival is a FULL date, not
-- a day offset, so an overnight flight (departs 22h40 on the 14th, lands 06h15 on the 15th) states
-- a real arrival day instead of leaving the reader to infer one.
--
-- `time` (not timestamptz): a flight departs at a wall-clock time at its origin airport. Storing an
-- instant would force a timezone the app does not model, and date + time reads back with no
-- conversion at all -- unlike booking_transport_requests.pickup_at, which build-service-blocks has
-- to run through formatDateISO/formatTimeHHMM in APP_TIME_ZONE to avoid printing the wrong day.
-- Matches routes.departure_time/arrival_time (20260812110000_route_departure_arrival_times.sql).
--
-- Nullable throughout: these are airline-only. Non-airline legs leave them null, and the API
-- rejects a write of them on any other supplier kind, mirroring the hotel-only manual_room_price
-- guard in app/api/jobs/[id]/services/route.ts.
ALTER TABLE public.booking_services
  ADD COLUMN IF NOT EXISTS departure_time time,
  ADD COLUMN IF NOT EXISTS arrival_date date,
  ADD COLUMN IF NOT EXISTS arrival_time time,
  ADD COLUMN IF NOT EXISTS flight_number text,
  ADD COLUMN IF NOT EXISTS departure_airport_code text,
  ADD COLUMN IF NOT EXISTS arrival_airport_code text,
  ADD COLUMN IF NOT EXISTS hand_luggage_kg numeric(5,1),
  ADD COLUMN IF NOT EXISTS checked_luggage_kg numeric(5,1);

-- An arrival before its own departure day is always a data error, never an overnight flight. The
-- same-day inversion case (same date, arrival time at or before departure time) is enforced in the
-- API instead: a consultant mid-typing produces it transiently, and a table CHECK would reject the
-- row before they finish the field.
ALTER TABLE public.booking_services
  DROP CONSTRAINT IF EXISTS booking_services_arrival_after_departure;
ALTER TABLE public.booking_services
  ADD CONSTRAINT booking_services_arrival_after_departure
  CHECK (arrival_date IS NULL OR service_date IS NULL OR arrival_date >= service_date);

-- IATA is 3 letters; 4 is allowed so an ICAO code (FALA, FACT) taken off the operator's own
-- reference is not rejected. Stored uppercase by the API.
ALTER TABLE public.booking_services
  DROP CONSTRAINT IF EXISTS booking_services_airport_code_format;
ALTER TABLE public.booking_services
  ADD CONSTRAINT booking_services_airport_code_format
  CHECK (
    (departure_airport_code IS NULL OR departure_airport_code ~ '^[A-Z]{3,4}$')
    AND (arrival_airport_code IS NULL OR arrival_airport_code ~ '^[A-Z]{3,4}$')
  );

ALTER TABLE public.booking_services
  DROP CONSTRAINT IF EXISTS booking_services_flight_number_length;
ALTER TABLE public.booking_services
  ADD CONSTRAINT booking_services_flight_number_length
  CHECK (flight_number IS NULL OR char_length(flight_number) BETWEEN 2 AND 20);

ALTER TABLE public.booking_services
  DROP CONSTRAINT IF EXISTS booking_services_luggage_nonnegative;
ALTER TABLE public.booking_services
  ADD CONSTRAINT booking_services_luggage_nonnegative
  CHECK (
    (hand_luggage_kg IS NULL OR hand_luggage_kg >= 0)
    AND (checked_luggage_kg IS NULL OR checked_luggage_kg >= 0)
  );

COMMENT ON COLUMN public.booking_services.departure_time IS
  'Airline legs only: wall-clock departure time at the origin airport. The departure date is service_date.';
COMMENT ON COLUMN public.booking_services.arrival_date IS
  'Airline legs only: full arrival date, so an overnight flight states a real arrival day rather than an inferred offset.';
COMMENT ON COLUMN public.booking_services.arrival_time IS
  'Airline legs only: wall-clock arrival time at the destination airport.';
COMMENT ON COLUMN public.booking_services.flight_number IS
  'Airline legs only: the operating flight number as printed on the ticket, e.g. FA212.';
COMMENT ON COLUMN public.booking_services.departure_airport_code IS
  'Airline legs only: IATA (3) or ICAO (4) code for the departure airport, uppercase.';
COMMENT ON COLUMN public.booking_services.arrival_airport_code IS
  'Airline legs only: IATA (3) or ICAO (4) code for the arrival airport, uppercase.';
COMMENT ON COLUMN public.booking_services.hand_luggage_kg IS
  'Airline legs only: hand luggage allowance per passenger, in kg.';
COMMENT ON COLUMN public.booking_services.checked_luggage_kg IS
  'Airline legs only: checked luggage allowance per passenger, in kg.';

NOTIFY pgrst, 'reload schema';
