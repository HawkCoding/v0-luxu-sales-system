-- Voucher parity: the legacy voucher had a full flight block (PNR, passengers, flight number,
-- airports, baggage allowance, priority boarding). Flights reuse booking_transport_requests --
-- pickup/dropoff become the departure/arrival airports, pickup_at the departure time,
-- supplier_reference the PNR, passenger_count the pax -- exactly how 'rental' reuses it today,
-- so the existing capture UI, builder ordering and leg-scoping logic all carry over unchanged.
-- booking_flight_details is the 1:1 side table for the fields a transfer/rental has no use for,
-- mirroring booking_vehicle_rental_details.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'booking_transport_requests_service_type_check'
  ) THEN
    ALTER TABLE public.booking_transport_requests
      DROP CONSTRAINT booking_transport_requests_service_type_check;
  END IF;

  ALTER TABLE public.booking_transport_requests
    ADD CONSTRAINT booking_transport_requests_service_type_check
    CHECK (service_type IN ('transfer', 'rental', 'flight'));
END $$;

CREATE TABLE IF NOT EXISTS public.booking_flight_details (
  transport_request_id uuid NOT NULL,
  cabin text,
  departure_airport_code text,
  arrival_airport_code text,
  arrival_at timestamptz,
  hand_luggage_kg numeric,
  checked_luggage_kg numeric,
  priority_boarding boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT booking_flight_details_pkey PRIMARY KEY (transport_request_id),
  CONSTRAINT booking_flight_details_hand_luggage_kg_check CHECK (hand_luggage_kg IS NULL OR hand_luggage_kg >= 0),
  CONSTRAINT booking_flight_details_checked_luggage_kg_check CHECK (checked_luggage_kg IS NULL OR checked_luggage_kg >= 0)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'booking_flight_details_transport_request_id_fkey'
  ) THEN
    ALTER TABLE public.booking_flight_details
      ADD CONSTRAINT booking_flight_details_transport_request_id_fkey
      FOREIGN KEY (transport_request_id) REFERENCES public.booking_transport_requests(id) ON DELETE CASCADE;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_updated_at_booking_flight_details ON public.booking_flight_details;
CREATE TRIGGER trg_updated_at_booking_flight_details
BEFORE UPDATE ON public.booking_flight_details
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT ALL ON TABLE public.booking_flight_details TO anon;
GRANT ALL ON TABLE public.booking_flight_details TO authenticated;
GRANT ALL ON TABLE public.booking_flight_details TO service_role;

ALTER TABLE public.booking_flight_details ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'booking_flight_details'
      AND policyname = 'biz_select'
  ) THEN
    CREATE POLICY biz_select ON public.booking_flight_details
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'booking_flight_details'
      AND policyname = 'biz_insert'
  ) THEN
    CREATE POLICY biz_insert ON public.booking_flight_details
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'booking_flight_details'
      AND policyname = 'biz_update'
  ) THEN
    CREATE POLICY biz_update ON public.booking_flight_details
      FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'booking_flight_details'
      AND policyname = 'biz_delete'
  ) THEN
    CREATE POLICY biz_delete ON public.booking_flight_details
      FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
