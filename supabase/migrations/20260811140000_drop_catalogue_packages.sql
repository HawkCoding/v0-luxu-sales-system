-- Drops the catalogue-package model entirely. Build Booking (booking_services, added by
-- 20260729100000) replaced it: the admin UI, its API routes and the apply flow are gone from the
-- app, and nothing writes to any of these objects any more.
--
-- Verified empty before writing this migration:
--   - production: 0 booking_package_selections, 0 bookings with package_id set,
--     0 booking_transport_requests with package_leg_id set. The 5 `packages` rows were 1 authored
--     package plus 4 auto-generated per-booking "hidden" rows from the pre-cutover implementation.
--   - local seed: the three pre-cutover fixture bookings were removed from seed.sql alongside this.
--
-- The one authored package (Blue Train Five Night Package) is preserved as a record in
-- supabase/archive/2026-08-11-catalogue-packages.sql -- there is no UI left that could display it.

-- booking_transport_requests.package_leg_id: superseded by service_id (20260729120000). Rebuild
-- the RPC first so it stops writing the column, then drop it.
CREATE OR REPLACE FUNCTION public.replace_booking_transport_requests(
  p_booking_id uuid,
  p_transport_requests jsonb,
  p_rental_details jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.bookings WHERE id = p_booking_id) THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  DELETE FROM public.booking_transport_requests
  WHERE booking_id = p_booking_id;

  INSERT INTO public.booking_transport_requests (
    id,
    booking_id,
    service_type,
    supplier_id,
    route_id,
    suite_type_id,
    service_id,
    pickup_point,
    dropoff_point,
    pickup_at,
    passenger_count,
    luggage_count,
    flight_number,
    price_override,
    notes,
    sort_order
  )
  SELECT
    request.id,
    p_booking_id,
    request.service_type,
    request.supplier_id,
    request.route_id,
    request.suite_type_id,
    request.service_id,
    request.pickup_point,
    request.dropoff_point,
    request.pickup_at,
    request.passenger_count,
    request.luggage_count,
    request.flight_number,
    request.price_override,
    request.notes,
    request.sort_order
  FROM jsonb_to_recordset(p_transport_requests) AS request(
    id uuid,
    service_type text,
    supplier_id uuid,
    route_id uuid,
    suite_type_id uuid,
    service_id uuid,
    pickup_point text,
    dropoff_point text,
    pickup_at timestamptz,
    passenger_count integer,
    luggage_count integer,
    flight_number text,
    price_override numeric,
    notes text,
    sort_order integer
  );

  INSERT INTO public.booking_vehicle_rental_details (
    transport_request_id,
    return_at,
    return_cutoff_time
  )
  SELECT
    rental_detail.transport_request_id,
    rental_detail.return_at,
    rental_detail.return_cutoff_time
  FROM jsonb_to_recordset(p_rental_details) AS rental_detail(
    transport_request_id uuid,
    return_at timestamptz,
    return_cutoff_time time
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_booking_transport_requests(uuid, jsonb, jsonb) TO authenticated;

ALTER TABLE public.booking_transport_requests
  DROP COLUMN IF EXISTS package_leg_id;

-- The per-booking selection model, replaced by booking_services/booking_service_units.
-- Units first: they FK onto selections.
DROP TABLE IF EXISTS public.booking_package_selection_units;
DROP TABLE IF EXISTS public.booking_package_selections;

-- Display-only label on bookings; nothing has written it since the catalogue apply route was
-- removed, and invoices/worksheets now show the route name instead.
ALTER TABLE public.bookings
  DROP COLUMN IF EXISTS package_id;

-- hotel_offers is itself unused (0 rows in production) but is not this migration's business;
-- just release its dependency on packages so the drop can proceed.
ALTER TABLE public.hotel_offers
  DROP COLUMN IF EXISTS package_id;

-- The catalogue itself. package_leg_routes -> package_legs -> packages by FK depth.
DROP TABLE IF EXISTS public.package_leg_routes;
DROP TABLE IF EXISTS public.package_legs;
DROP TABLE IF EXISTS public.packages;

NOTIFY pgrst, 'reload schema';
