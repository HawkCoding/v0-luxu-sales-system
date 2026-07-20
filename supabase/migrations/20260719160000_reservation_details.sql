-- Manual reservation-form entry: adds the fields returned on the client's
-- signed reservation form (guest residence, special requests, agency
-- details) so staff can record them and feed the invoice/voucher PDFs.

-- 1. Guest residence (country) — the last core field from the reservation
--    form's guest grid not already on travellers.
ALTER TABLE public.travellers ADD COLUMN IF NOT EXISTS residence text;

-- 2. Booking-level reservation details returned on the form: special
--    requests and agency info. One row per booking.
CREATE TABLE IF NOT EXISTS public.booking_reservation_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  dietary text,
  medical text,
  occasion text,
  smoking_preference text CHECK (smoking_preference IN ('smoking', 'non_smoking')),
  meal_seating text CHECK (meal_seating IN ('first', 'second')),
  agency_name text,
  agency_address text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_booking_reservation_details_booking_id
  ON public.booking_reservation_details (booking_id);

ALTER TABLE public.booking_reservation_details ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'booking_reservation_details' AND policyname = 'biz_select'
  ) THEN
    CREATE POLICY biz_select ON public.booking_reservation_details
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'booking_reservation_details' AND policyname = 'biz_insert'
  ) THEN
    CREATE POLICY biz_insert ON public.booking_reservation_details
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'booking_reservation_details' AND policyname = 'biz_update'
  ) THEN
    CREATE POLICY biz_update ON public.booking_reservation_details
      FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'booking_reservation_details' AND policyname = 'biz_delete'
  ) THEN
    CREATE POLICY biz_delete ON public.booking_reservation_details
      FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

DROP TRIGGER IF EXISTS set_booking_reservation_details_updated_at ON public.booking_reservation_details;
CREATE TRIGGER set_booking_reservation_details_updated_at
  BEFORE UPDATE ON public.booking_reservation_details
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT ALL ON TABLE public.booking_reservation_details TO anon;
GRANT ALL ON TABLE public.booking_reservation_details TO authenticated;
GRANT ALL ON TABLE public.booking_reservation_details TO service_role;

NOTIFY pgrst, 'reload schema';
