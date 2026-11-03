-- Pax groups: a booking's travellers split per main-product unit (usually one per train suite), each
-- configured and priced on its own, so the quote, invoice and emails can read one line per suite.
--
-- A group is anchored to one unit of the booking's primary service (its train suite, or its room when
-- a hotel is the main product): that unit's pax_group_ids holds exactly the group's id. Every other
-- unit (a hotel room, a cabin, a tour party) and every transfer or rental lists the groups it serves:
--   * empty  = shared by every group (today's behaviour, and every row written before this migration)
--   * [a, b] = only groups a and b — one hotel apartment for two suites, a flight only one suite takes.
-- A booking whose primary service has a single unit has no groups at all and behaves exactly as before.
--
-- The groups live in their own table rather than being the primary units' ids: units are replaced
-- wholesale on every Build Booking save (replace_booking_service_units), and a unit added in the
-- dialog only gets its id on that save, so nothing could point at it beforehand. A group's id is
-- minted by the dialog and survives every save.

CREATE TABLE IF NOT EXISTS public.booking_pax_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  -- 1..N across the whole booking: "Suite 2" and its guests 2.1, 2.2.
  position integer NOT NULL,
  -- Null prints the automatic name ("Twin Deluxe Suite 2"); a typed name replaces it.
  label text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT booking_pax_groups_position_positive CHECK (position > 0)
);

CREATE INDEX IF NOT EXISTS idx_booking_pax_groups_booking_id ON public.booking_pax_groups (booking_id);

ALTER TABLE public.booking_pax_groups ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'booking_pax_groups' AND policyname = 'biz_select'
  ) THEN
    CREATE POLICY biz_select ON public.booking_pax_groups FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'booking_pax_groups' AND policyname = 'biz_insert'
  ) THEN
    CREATE POLICY biz_insert ON public.booking_pax_groups FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'booking_pax_groups' AND policyname = 'biz_update'
  ) THEN
    CREATE POLICY biz_update ON public.booking_pax_groups FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'booking_pax_groups' AND policyname = 'biz_delete'
  ) THEN
    CREATE POLICY biz_delete ON public.booking_pax_groups FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

DROP TRIGGER IF EXISTS set_booking_pax_groups_updated_at ON public.booking_pax_groups;
CREATE TRIGGER set_booking_pax_groups_updated_at
  BEFORE UPDATE ON public.booking_pax_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT ALL ON TABLE public.booking_pax_groups TO anon;
GRANT ALL ON TABLE public.booking_pax_groups TO authenticated;
GRANT ALL ON TABLE public.booking_pax_groups TO service_role;

-- Which groups a unit serves (see the header). An array rather than a join table: units are deleted
-- and re-inserted on every save, so a join row would cascade away with them unless rewritten in the
-- same statement anyway. A stale id (its group since removed) is ignored by every reader.
ALTER TABLE public.booking_service_units
  ADD COLUMN IF NOT EXISTS pax_group_ids uuid[] NOT NULL DEFAULT '{}';

-- Guests in this unit on a different rate type from the unit's own, e.g. one SA resident and one
-- international guest sharing a suite: [{ "rateTypeId": uuid, "adultCount": 1, "childCount": 0,
-- "infantCount": 0 }]. The unit's remaining guests price at its own rate type.
ALTER TABLE public.booking_service_units
  ADD COLUMN IF NOT EXISTS rate_splits jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.booking_service_units DROP CONSTRAINT IF EXISTS booking_service_units_rate_splits_is_array;
ALTER TABLE public.booking_service_units
  ADD CONSTRAINT booking_service_units_rate_splits_is_array CHECK (jsonb_typeof(rate_splits) = 'array');

ALTER TABLE public.booking_transport_requests
  ADD COLUMN IF NOT EXISTS pax_group_ids uuid[] NOT NULL DEFAULT '{}';

-- The traveller's suite. Replaces the free-text room_with guess wherever the booking has groups.
ALTER TABLE public.travellers
  ADD COLUMN IF NOT EXISTS pax_group_id uuid REFERENCES public.booking_pax_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_travellers_pax_group_id ON public.travellers (pax_group_id);

-- The short tag client documents print after a price on a suite line: "(SA)", "(TW)". Blank prints
-- nothing. Separate from client_label, which is the long wording the {{rateLabel}} token uses.
ALTER TABLE public.rate_types
  ADD COLUMN IF NOT EXISTS short_label text;

-- Replace-set for a booking's groups, in one transaction: upsert every group sent, delete the rest.
-- p_groups: [{ "id": uuid, "position": 1, "label": "Honeymoon suite" | null }, ...]
CREATE OR REPLACE FUNCTION public.replace_booking_pax_groups(
  p_booking_id uuid,
  p_groups jsonb
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

  -- A group id belongs to one booking for good; reusing another booking's id would move its group.
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(coalesce(p_groups, '[]'::jsonb)) AS g(id uuid, position integer, label text)
    JOIN public.booking_pax_groups existing ON existing.id = g.id
    WHERE existing.booking_id <> p_booking_id
  ) THEN
    RAISE EXCEPTION 'pax group belongs to another booking'
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.booking_pax_groups
  WHERE booking_id = p_booking_id
    AND id NOT IN (
      SELECT g.id
      FROM jsonb_to_recordset(coalesce(p_groups, '[]'::jsonb)) AS g(id uuid, position integer, label text)
      WHERE g.id IS NOT NULL
    );

  INSERT INTO public.booking_pax_groups (id, booking_id, position, label)
  SELECT g.id, p_booking_id, g.position, nullif(btrim(g.label), '')
  FROM jsonb_to_recordset(coalesce(p_groups, '[]'::jsonb)) AS g(id uuid, position integer, label text)
  WHERE g.id IS NOT NULL
  ON CONFLICT (id) DO UPDATE
    SET position = excluded.position,
        label = excluded.label;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_booking_pax_groups(uuid, jsonb) TO authenticated;

-- Carry the two new unit columns through the atomic unit replace (20261026120000). Any column
-- missing from this list is silently reset on every Build Booking save.
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
    origin,
    pax_group_ids,
    rate_splits
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
    COALESCE(u.origin, 'consultant'),
    COALESCE(u.pax_group_ids, '{}'),
    COALESCE(u.rate_splits, '[]'::jsonb)
  FROM jsonb_populate_recordset(NULL::public.booking_service_units, p_units) u;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_booking_service_units(uuid[], jsonb) TO authenticated;

-- Carry pax_group_ids through the transport-request replace-set (last rebuilt by
-- 20260827100000_transfer_per_person_pricing.sql).
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
