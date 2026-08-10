-- A train supplier boards guests at a different station in every city it serves, so the single
-- suppliers.street_address (added by 20260805110000 for voucher parity) can only ever hold one of
-- them. One row per (supplier, city) lets a route resolve its boarding and arrival addresses from
-- its own origin/destination locations, honouring route_reversed.
CREATE TABLE IF NOT EXISTS public.supplier_station_addresses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  supplier_id uuid NOT NULL,
  location_id uuid NOT NULL,
  station_name text,
  street_address text,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT supplier_station_addresses_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'supplier_station_addresses_supplier_id_fkey'
  ) THEN
    ALTER TABLE ONLY public.supplier_station_addresses
      ADD CONSTRAINT supplier_station_addresses_supplier_id_fkey
      FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'supplier_station_addresses_location_id_fkey'
  ) THEN
    ALTER TABLE ONLY public.supplier_station_addresses
      ADD CONSTRAINT supplier_station_addresses_location_id_fkey
      FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_supplier_station_addresses_supplier_id
  ON public.supplier_station_addresses USING btree (supplier_id);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_station_addresses_supplier_location_uniq
  ON public.supplier_station_addresses USING btree (supplier_id, location_id);

DROP TRIGGER IF EXISTS trg_updated_at_supplier_station_addresses ON public.supplier_station_addresses;
CREATE TRIGGER trg_updated_at_supplier_station_addresses
BEFORE UPDATE ON public.supplier_station_addresses
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT ALL ON TABLE public.supplier_station_addresses TO anon;
GRANT ALL ON TABLE public.supplier_station_addresses TO authenticated;
GRANT ALL ON TABLE public.supplier_station_addresses TO service_role;

ALTER TABLE public.supplier_station_addresses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'supplier_station_addresses'
      AND policyname = 'ref_select'
  ) THEN
    CREATE POLICY ref_select ON public.supplier_station_addresses
      FOR SELECT TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'supplier_station_addresses'
      AND policyname = 'ref_insert'
  ) THEN
    CREATE POLICY ref_insert ON public.supplier_station_addresses
      FOR INSERT TO authenticated
      WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'supplier_station_addresses'
      AND policyname = 'ref_update'
  ) THEN
    CREATE POLICY ref_update ON public.supplier_station_addresses
      FOR UPDATE TO authenticated
      USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
      WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'supplier_station_addresses'
      AND policyname = 'ref_delete'
  ) THEN
    CREATE POLICY ref_delete ON public.supplier_station_addresses
      FOR DELETE TO authenticated
      USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
