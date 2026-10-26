-- Atomic replace-set for a booking's rooms, cabins and suites.
--
-- PATCH /api/jobs/[id]/services used to replace units with two separate PostgREST calls: a
-- DELETE of every unit under the saved services, then a bulk INSERT of the new set. Nothing tied
-- them together, so an INSERT that failed (a rejected row, a dropped connection) left the
-- services with no units at all until the consultant saved again -- the save failed *and* the
-- stored rooms were gone.
--
-- This runs both statements in one function call, i.e. one transaction: a failed insert rolls the
-- delete back and the stored rooms survive untouched. Mirrors replace_booking_transport_requests.
--
-- Columns are named explicitly rather than INSERT ... SELECT * so anything the caller omits
-- (created_at, updated_at) takes the column default instead of NULL. id is always supplied by the
-- API -- a kept unit's own id, or a fresh one -- because Build Booking holds those ids for the
-- pricing call that follows.

CREATE OR REPLACE FUNCTION public.replace_booking_service_units(
  p_service_ids uuid[],
  p_units jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.booking_service_units
  WHERE service_id = ANY (p_service_ids);

  IF p_units IS NULL OR jsonb_array_length(p_units) = 0 THEN
    RETURN;
  END IF;

  -- A unit may only land under one of the services being replaced; anything else would slip a
  -- row past the replace-set the caller asked for.
  IF EXISTS (
    SELECT 1
    FROM jsonb_populate_recordset(NULL::public.booking_service_units, p_units) u
    WHERE u.service_id IS NULL OR NOT (u.service_id = ANY (p_service_ids))
  ) THEN
    RAISE EXCEPTION 'unit service_id is not one of the services being replaced'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.booking_service_units (
    id,
    service_id,
    suite_type_id,
    bedroom_type_id,
    bedroom_layout_id,
    bathroom_type_id,
    adult_count,
    child_count,
    infant_count,
    sort_order,
    manual_adult_price,
    manual_child_price,
    manual_infant_price,
    manual_room_price,
    complimentary_first_night,
    manual_room_price_set_at,
    manual_room_price_set_by,
    manual_tour_price,
    manual_tour_price_set_at,
    manual_tour_price_set_by,
    fare_override_adult,
    fare_override_child,
    fare_override_infant,
    fare_override_set_at,
    fare_override_set_by,
    rate_type_id,
    origin
  )
  SELECT
    COALESCE(u.id, gen_random_uuid()),
    u.service_id,
    u.suite_type_id,
    u.bedroom_type_id,
    u.bedroom_layout_id,
    u.bathroom_type_id,
    COALESCE(u.adult_count, 0),
    COALESCE(u.child_count, 0),
    COALESCE(u.infant_count, 0),
    COALESCE(u.sort_order, 0),
    u.manual_adult_price,
    u.manual_child_price,
    u.manual_infant_price,
    u.manual_room_price,
    COALESCE(u.complimentary_first_night, false),
    u.manual_room_price_set_at,
    u.manual_room_price_set_by,
    u.manual_tour_price,
    u.manual_tour_price_set_at,
    u.manual_tour_price_set_by,
    u.fare_override_adult,
    u.fare_override_child,
    u.fare_override_infant,
    u.fare_override_set_at,
    u.fare_override_set_by,
    u.rate_type_id,
    COALESCE(u.origin, 'consultant')
  FROM jsonb_populate_recordset(NULL::public.booking_service_units, p_units) u;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_booking_service_units(uuid[], jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
