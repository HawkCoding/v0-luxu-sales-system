-- Optional per-transfer price override: when set, the quote line for this transport request
-- uses it instead of the vehicle-category rate card price.
ALTER TABLE public.booking_transport_requests
  ADD COLUMN IF NOT EXISTS price_override numeric;

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
    package_leg_id,
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
    request.package_leg_id,
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
    package_leg_id uuid,
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
