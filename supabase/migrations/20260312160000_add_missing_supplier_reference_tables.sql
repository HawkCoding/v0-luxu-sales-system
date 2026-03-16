-- supplier_pricing_options, supplier_seasonal_periods, and supplier_seasonal_prices were
-- present in the dev remote-schema dump but were never created in production because the
-- production Supabase project was bootstrapped from a different initial migration set.
-- This migration makes the three tables idempotent across all environments.

CREATE TABLE IF NOT EXISTS public.supplier_pricing_options (
  id         uuid           DEFAULT gen_random_uuid() NOT NULL,
  supplier_id uuid          NOT NULL,
  name       text           NOT NULL,
  is_primary boolean        DEFAULT false             NOT NULL,
  single_price numeric(12,2)                          NOT NULL,
  double_price numeric(12,2)                          NOT NULL,
  family_price numeric(12,2)                          NOT NULL,
  currency   text           DEFAULT 'ZAR'::text       NOT NULL,
  created_at timestamptz    DEFAULT now()             NOT NULL,
  updated_at timestamptz    DEFAULT now()             NOT NULL,
  CONSTRAINT supplier_pricing_options_pkey PRIMARY KEY (id),
  CONSTRAINT supplier_pricing_options_unique_name_per_supplier UNIQUE (supplier_id, name)
);

CREATE TABLE IF NOT EXISTS public.supplier_seasonal_periods (
  id          uuid        DEFAULT gen_random_uuid() NOT NULL,
  supplier_id uuid        NOT NULL,
  label       text,
  valid_from  date        NOT NULL,
  valid_to    date        NOT NULL,
  created_at  timestamptz DEFAULT now()             NOT NULL,
  CONSTRAINT supplier_seasonal_periods_pkey       PRIMARY KEY (id),
  CONSTRAINT supplier_seasonal_periods_date_check CHECK (valid_to >= valid_from)
);

CREATE TABLE IF NOT EXISTS public.supplier_seasonal_prices (
  id           uuid           DEFAULT gen_random_uuid() NOT NULL,
  period_id    uuid           NOT NULL,
  option_id    uuid           NOT NULL,
  single_price numeric(12,2)  NOT NULL,
  double_price numeric(12,2)  NOT NULL,
  family_price numeric(12,2)  NOT NULL,
  created_at   timestamptz    DEFAULT now()             NOT NULL,
  CONSTRAINT supplier_seasonal_prices_pkey   PRIMARY KEY (id),
  CONSTRAINT supplier_seasonal_prices_unique UNIQUE (period_id, option_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'supplier_pricing_options_supplier_id_fkey'
  ) THEN
    ALTER TABLE ONLY public.supplier_pricing_options
      ADD CONSTRAINT supplier_pricing_options_supplier_id_fkey
      FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'supplier_seasonal_periods_supplier_id_fkey'
  ) THEN
    ALTER TABLE ONLY public.supplier_seasonal_periods
      ADD CONSTRAINT supplier_seasonal_periods_supplier_id_fkey
      FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'supplier_seasonal_prices_option_id_fkey'
  ) THEN
    ALTER TABLE ONLY public.supplier_seasonal_prices
      ADD CONSTRAINT supplier_seasonal_prices_option_id_fkey
      FOREIGN KEY (option_id) REFERENCES public.supplier_pricing_options(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'supplier_seasonal_prices_period_id_fkey'
  ) THEN
    ALTER TABLE ONLY public.supplier_seasonal_prices
      ADD CONSTRAINT supplier_seasonal_prices_period_id_fkey
      FOREIGN KEY (period_id) REFERENCES public.supplier_seasonal_periods(id) ON DELETE CASCADE;
  END IF;
END $$;

GRANT ALL ON TABLE public.supplier_pricing_options  TO anon;
GRANT ALL ON TABLE public.supplier_pricing_options  TO authenticated;
GRANT ALL ON TABLE public.supplier_pricing_options  TO service_role;

GRANT ALL ON TABLE public.supplier_seasonal_periods TO anon;
GRANT ALL ON TABLE public.supplier_seasonal_periods TO authenticated;
GRANT ALL ON TABLE public.supplier_seasonal_periods TO service_role;

GRANT ALL ON TABLE public.supplier_seasonal_prices  TO anon;
GRANT ALL ON TABLE public.supplier_seasonal_prices  TO authenticated;
GRANT ALL ON TABLE public.supplier_seasonal_prices  TO service_role;

ALTER TABLE public.supplier_pricing_options  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_seasonal_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_seasonal_prices  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- supplier_pricing_options
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='supplier_pricing_options' AND policyname='ref_select') THEN
    CREATE POLICY ref_select ON public.supplier_pricing_options FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='supplier_pricing_options' AND policyname='ref_insert') THEN
    CREATE POLICY ref_insert ON public.supplier_pricing_options FOR INSERT TO authenticated
      WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='supplier_pricing_options' AND policyname='ref_update') THEN
    CREATE POLICY ref_update ON public.supplier_pricing_options FOR UPDATE TO authenticated
      USING  (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
      WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='supplier_pricing_options' AND policyname='ref_delete') THEN
    CREATE POLICY ref_delete ON public.supplier_pricing_options FOR DELETE TO authenticated
      USING (public.auth_has_role(ARRAY['admin'::public.user_role]));
  END IF;

  -- supplier_seasonal_periods
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='supplier_seasonal_periods' AND policyname='ref_select') THEN
    CREATE POLICY ref_select ON public.supplier_seasonal_periods FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='supplier_seasonal_periods' AND policyname='ref_insert') THEN
    CREATE POLICY ref_insert ON public.supplier_seasonal_periods FOR INSERT TO authenticated
      WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='supplier_seasonal_periods' AND policyname='ref_update') THEN
    CREATE POLICY ref_update ON public.supplier_seasonal_periods FOR UPDATE TO authenticated
      USING  (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
      WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='supplier_seasonal_periods' AND policyname='ref_delete') THEN
    CREATE POLICY ref_delete ON public.supplier_seasonal_periods FOR DELETE TO authenticated
      USING (public.auth_has_role(ARRAY['admin'::public.user_role]));
  END IF;

  -- supplier_seasonal_prices
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='supplier_seasonal_prices' AND policyname='ref_select') THEN
    CREATE POLICY ref_select ON public.supplier_seasonal_prices FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='supplier_seasonal_prices' AND policyname='ref_insert') THEN
    CREATE POLICY ref_insert ON public.supplier_seasonal_prices FOR INSERT TO authenticated
      WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='supplier_seasonal_prices' AND policyname='ref_update') THEN
    CREATE POLICY ref_update ON public.supplier_seasonal_prices FOR UPDATE TO authenticated
      USING  (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
      WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='supplier_seasonal_prices' AND policyname='ref_delete') THEN
    CREATE POLICY ref_delete ON public.supplier_seasonal_prices FOR DELETE TO authenticated
      USING (public.auth_has_role(ARRAY['admin'::public.user_role]));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
