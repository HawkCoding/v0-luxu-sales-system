-- Build Booking replaces a booking's transport requests wholesale on every save. The previous
-- version of this function (20261028100000_pax_groups.sql) deleted every row and re-inserted
-- without supplier_reference, supplier_contact_name or voucher_footnote, so each Next click in
-- Build Booking wiped the references staff had entered on transfers, and the voucher then
-- hard-failed on missing references.
--
-- Those three columns are not part of the payload (they are edited through the leg-references
-- route), so capture them by request id before the delete and put them back after the insert.
-- Rows the caller drops stay dropped; rows it keeps (same id) keep their supplier details.
-- Idempotent: CREATE OR REPLACE.

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
DECLARE
  v_saved jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.bookings WHERE id = p_booking_id) THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'supplier_reference', t.supplier_reference,
        'supplier_contact_name', t.supplier_contact_name,
        'voucher_footnote', t.voucher_footnote
      )
    ),
    '[]'::jsonb
  )
  INTO v_saved
  FROM public.booking_transport_requests t
  WHERE t.booking_id = p_booking_id
    AND (
      t.supplier_reference IS NOT NULL
      OR t.supplier_contact_name IS NOT NULL
      OR t.voucher_footnote IS NOT NULL
    );

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
    sort_order,
    pricing_basis,
    adult_count,
    child_count,
    infant_count,
    price_override_child,
    price_override_infant,
    pax_group_ids
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
    request.sort_order,
    request.pricing_basis,
    request.adult_count,
    request.child_count,
    request.infant_count,
    request.price_override_child,
    request.price_override_infant,
    coalesce(request.pax_group_ids, '{}')
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
    sort_order integer,
    pricing_basis public.transport_pricing_basis,
    adult_count integer,
    child_count integer,
    infant_count integer,
    price_override_child numeric,
    price_override_infant numeric,
    pax_group_ids uuid[]
  );

  UPDATE public.booking_transport_requests t
  SET
    supplier_reference = saved.supplier_reference,
    supplier_contact_name = saved.supplier_contact_name,
    voucher_footnote = saved.voucher_footnote
  FROM jsonb_to_recordset(v_saved) AS saved(
    id uuid,
    supplier_reference text,
    supplier_contact_name text,
    voucher_footnote text
  )
  WHERE t.id = saved.id
    AND t.booking_id = p_booking_id;

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
