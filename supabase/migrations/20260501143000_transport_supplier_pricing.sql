ALTER TABLE public.routes
  ALTER COLUMN origin_location_id DROP NOT NULL,
  ALTER COLUMN destination_location_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS transport_service_type text,
  ADD COLUMN IF NOT EXISTS pickup_point text,
  ADD COLUMN IF NOT EXISTS dropoff_point text,
  ADD COLUMN IF NOT EXISTS included_km_per_day numeric(12,2),
  ADD COLUMN IF NOT EXISTS extra_km_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS security_deposit numeric(12,2),
  ADD COLUMN IF NOT EXISTS one_way_fee numeric(12,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'routes_transport_service_type_check'
  ) THEN
    ALTER TABLE public.routes
      ADD CONSTRAINT routes_transport_service_type_check
      CHECK (transport_service_type IS NULL OR transport_service_type IN ('transfer', 'rental'));
  END IF;
END $$;

ALTER TABLE public.suite_types
  ADD COLUMN IF NOT EXISTS passenger_capacity integer,
  ADD COLUMN IF NOT EXISTS luggage_capacity integer,
  ADD COLUMN IF NOT EXISTS description text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'suite_types_passenger_capacity_check'
  ) THEN
    ALTER TABLE public.suite_types
      ADD CONSTRAINT suite_types_passenger_capacity_check
      CHECK (passenger_capacity IS NULL OR passenger_capacity >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'suite_types_luggage_capacity_check'
  ) THEN
    ALTER TABLE public.suite_types
      ADD CONSTRAINT suite_types_luggage_capacity_check
      CHECK (luggage_capacity IS NULL OR luggage_capacity >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.booking_transport_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  booking_id uuid NOT NULL,
  service_type text NOT NULL,
  supplier_id uuid,
  route_id uuid,
  suite_type_id uuid,
  pickup_point text NOT NULL,
  dropoff_point text NOT NULL,
  pickup_at timestamptz,
  return_at timestamptz,
  passenger_count integer,
  luggage_count integer,
  flight_number text,
  notes text,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT booking_transport_requests_pkey PRIMARY KEY (id),
  CONSTRAINT booking_transport_requests_service_type_check CHECK (service_type IN ('transfer', 'rental')),
  CONSTRAINT booking_transport_requests_passenger_count_check CHECK (passenger_count IS NULL OR passenger_count >= 0),
  CONSTRAINT booking_transport_requests_luggage_count_check CHECK (luggage_count IS NULL OR luggage_count >= 0)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'booking_transport_requests_booking_id_fkey'
  ) THEN
    ALTER TABLE public.booking_transport_requests
      ADD CONSTRAINT booking_transport_requests_booking_id_fkey
      FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'booking_transport_requests_supplier_id_fkey'
  ) THEN
    ALTER TABLE public.booking_transport_requests
      ADD CONSTRAINT booking_transport_requests_supplier_id_fkey
      FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'booking_transport_requests_route_id_fkey'
  ) THEN
    ALTER TABLE public.booking_transport_requests
      ADD CONSTRAINT booking_transport_requests_route_id_fkey
      FOREIGN KEY (route_id) REFERENCES public.routes(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'booking_transport_requests_suite_type_id_fkey'
  ) THEN
    ALTER TABLE public.booking_transport_requests
      ADD CONSTRAINT booking_transport_requests_suite_type_id_fkey
      FOREIGN KEY (suite_type_id) REFERENCES public.suite_types(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS booking_transport_requests_booking_idx
  ON public.booking_transport_requests (booking_id, sort_order);

CREATE INDEX IF NOT EXISTS booking_transport_requests_supplier_idx
  ON public.booking_transport_requests (supplier_id);

DROP TRIGGER IF EXISTS trg_updated_at_booking_transport_requests ON public.booking_transport_requests;
CREATE TRIGGER trg_updated_at_booking_transport_requests
BEFORE UPDATE ON public.booking_transport_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

UPDATE public.routes route
SET
  transport_service_type = COALESCE(route.transport_service_type, 'transfer'),
  pickup_point = COALESCE(route.pickup_point, origin_location.name),
  dropoff_point = COALESCE(route.dropoff_point, destination_location.name)
FROM public.suppliers supplier
LEFT JOIN public.locations origin_location ON origin_location.id = route.origin_location_id
LEFT JOIN public.locations destination_location ON destination_location.id = route.destination_location_id
WHERE route.supplier_id = supplier.id
  AND supplier.kind = 'transfers';

GRANT ALL ON TABLE public.booking_transport_requests TO anon;
GRANT ALL ON TABLE public.booking_transport_requests TO authenticated;
GRANT ALL ON TABLE public.booking_transport_requests TO service_role;

ALTER TABLE public.booking_transport_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'booking_transport_requests'
      AND policyname = 'biz_select'
  ) THEN
    CREATE POLICY biz_select ON public.booking_transport_requests
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'booking_transport_requests'
      AND policyname = 'biz_insert'
  ) THEN
    CREATE POLICY biz_insert ON public.booking_transport_requests
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'booking_transport_requests'
      AND policyname = 'biz_update'
  ) THEN
    CREATE POLICY biz_update ON public.booking_transport_requests
      FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'booking_transport_requests'
      AND policyname = 'biz_delete'
  ) THEN
    CREATE POLICY biz_delete ON public.booking_transport_requests
      FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
