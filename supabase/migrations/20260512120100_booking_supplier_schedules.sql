CREATE TABLE IF NOT EXISTS public.booking_supplier_schedules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  booking_id uuid NOT NULL,
  supplier_id uuid,
  supplier_kind public.supplier_kind NOT NULL,
  label text,
  date_from date,
  date_to date,
  time_start time,
  time_end time,
  notes text,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT booking_supplier_schedules_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'booking_supplier_schedules_booking_id_fkey'
  ) THEN
    ALTER TABLE public.booking_supplier_schedules
      ADD CONSTRAINT booking_supplier_schedules_booking_id_fkey
      FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'booking_supplier_schedules_supplier_id_fkey'
  ) THEN
    ALTER TABLE public.booking_supplier_schedules
      ADD CONSTRAINT booking_supplier_schedules_supplier_id_fkey
      FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS booking_supplier_schedules_booking_idx
  ON public.booking_supplier_schedules (booking_id, sort_order);

CREATE INDEX IF NOT EXISTS booking_supplier_schedules_supplier_idx
  ON public.booking_supplier_schedules (supplier_id);

DROP TRIGGER IF EXISTS trg_updated_at_booking_supplier_schedules ON public.booking_supplier_schedules;
CREATE TRIGGER trg_updated_at_booking_supplier_schedules
BEFORE UPDATE ON public.booking_supplier_schedules
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT ALL ON TABLE public.booking_supplier_schedules TO anon;
GRANT ALL ON TABLE public.booking_supplier_schedules TO authenticated;
GRANT ALL ON TABLE public.booking_supplier_schedules TO service_role;

ALTER TABLE public.booking_supplier_schedules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'booking_supplier_schedules'
      AND policyname = 'biz_select'
  ) THEN
    CREATE POLICY biz_select ON public.booking_supplier_schedules
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'booking_supplier_schedules'
      AND policyname = 'biz_insert'
  ) THEN
    CREATE POLICY biz_insert ON public.booking_supplier_schedules
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'booking_supplier_schedules'
      AND policyname = 'biz_update'
  ) THEN
    CREATE POLICY biz_update ON public.booking_supplier_schedules
      FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'booking_supplier_schedules'
      AND policyname = 'biz_delete'
  ) THEN
    CREATE POLICY biz_delete ON public.booking_supplier_schedules
      FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
