CREATE TABLE IF NOT EXISTS public.booking_vehicle_rental_details (
  transport_request_id uuid NOT NULL,
  return_at timestamptz,
  return_cutoff_time time,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT booking_vehicle_rental_details_pkey PRIMARY KEY (transport_request_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'booking_vehicle_rental_details_transport_request_id_fkey'
  ) THEN
    ALTER TABLE public.booking_vehicle_rental_details
      ADD CONSTRAINT booking_vehicle_rental_details_transport_request_id_fkey
      FOREIGN KEY (transport_request_id) REFERENCES public.booking_transport_requests(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS booking_vehicle_rental_details_return_at_idx
  ON public.booking_vehicle_rental_details (return_at);

DROP TRIGGER IF EXISTS trg_updated_at_booking_vehicle_rental_details ON public.booking_vehicle_rental_details;
CREATE TRIGGER trg_updated_at_booking_vehicle_rental_details
BEFORE UPDATE ON public.booking_vehicle_rental_details
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT ALL ON TABLE public.booking_vehicle_rental_details TO anon;
GRANT ALL ON TABLE public.booking_vehicle_rental_details TO authenticated;
GRANT ALL ON TABLE public.booking_vehicle_rental_details TO service_role;

ALTER TABLE public.booking_vehicle_rental_details ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'booking_vehicle_rental_details'
      AND policyname = 'biz_select'
  ) THEN
    CREATE POLICY biz_select ON public.booking_vehicle_rental_details
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'booking_vehicle_rental_details'
      AND policyname = 'biz_insert'
  ) THEN
    CREATE POLICY biz_insert ON public.booking_vehicle_rental_details
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'booking_vehicle_rental_details'
      AND policyname = 'biz_update'
  ) THEN
    CREATE POLICY biz_update ON public.booking_vehicle_rental_details
      FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'booking_vehicle_rental_details'
      AND policyname = 'biz_delete'
  ) THEN
    CREATE POLICY biz_delete ON public.booking_vehicle_rental_details
      FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

ALTER TABLE public.booking_transport_requests
  DROP COLUMN IF EXISTS return_at;

NOTIFY pgrst, 'reload schema';
