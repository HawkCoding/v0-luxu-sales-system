-- Per-trip "complimentary" flag for transfer/rental legs.
--
-- Mirrors booking_service_units.complimentary_first_night (see
-- 20260818120000_hotel_complimentary_first_night.sql): a dedicated boolean, independent of
-- price_override, so the two compose instead of overloading "typed R0" to mean two different
-- things. Unlike a hotel stay, a transfer has no nights to partially gift -- a trip is either
-- complimentary (prices at 0, full stop) or it isn't.
ALTER TABLE public.booking_transport_requests
  ADD COLUMN IF NOT EXISTS complimentary boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.booking_transport_requests.complimentary IS
  'Transfers only: when true this trip is not charged, independent of price_override. Mirrors booking_service_units.complimentary_first_night.';

-- Rebuild the replace-set RPC to carry the new column through the full delete/reinsert cycle
-- (same function last touched by 20260818140000_transport_request_date_anchor.sql).
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
    date_anchor,
    passenger_count,
    luggage_count,
    flight_number,
    price_override,
    price_override_set_at,
    price_override_set_by,
    complimentary,
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
    request.date_anchor,
    request.passenger_count,
    request.luggage_count,
    request.flight_number,
    request.price_override,
    request.price_override_set_at,
    request.price_override_set_by,
    coalesce(request.complimentary, false),
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
    date_anchor text,
    passenger_count integer,
    luggage_count integer,
    flight_number text,
    price_override numeric,
    price_override_set_at timestamptz,
    price_override_set_by uuid,
    complimentary boolean,
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
