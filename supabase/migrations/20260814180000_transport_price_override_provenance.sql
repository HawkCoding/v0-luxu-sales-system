-- Provenance for booking_transport_requests.price_override, mirroring the hotel room override
-- added in 20260814160000_hotel_room_price_override.sql.
--
-- A transfer/rental's price override replaces the vehicle-category rate card for this specific
-- request, same idea as a hotel room's manual_room_price. set_at/set_by exist so the internal
-- quote view can show who put the number there and when, without a reverse lookup through
-- audit_logs.
ALTER TABLE public.booking_transport_requests
  ADD COLUMN IF NOT EXISTS price_override_set_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS price_override_set_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.booking_transport_requests
  DROP CONSTRAINT IF EXISTS booking_transport_requests_price_override_nonnegative;
ALTER TABLE public.booking_transport_requests
  ADD CONSTRAINT booking_transport_requests_price_override_nonnegative
  CHECK (price_override IS NULL OR price_override >= 0);

COMMENT ON COLUMN public.booking_transport_requests.price_override_set_at IS
  'When price_override was last changed to its current value. Null when there is no override.';
COMMENT ON COLUMN public.booking_transport_requests.price_override_set_by IS
  'Who last changed price_override to its current value. Null when there is no override.';

-- Rebuild the replace-set RPC to carry the two new columns through the full delete/reinsert cycle
-- (same function last touched by 20260811140000_drop_catalogue_packages.sql, which dropped
-- package_leg_id from both the table and this function).
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
    price_override_set_at,
    price_override_set_by,
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
    request.price_override_set_at,
    request.price_override_set_by,
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
    price_override_set_at timestamptz,
    price_override_set_by uuid,
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

NOTIFY pgrst, 'reload schema';
