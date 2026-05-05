-- Production hardening for supplier pricing/settings endpoints.
-- This is intentionally idempotent so it can repair partially-applied manual DB updates.

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_settings TO authenticated;
GRANT ALL ON TABLE public.app_settings TO service_role;

DROP POLICY IF EXISTS "authenticated users can read app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "admins can update app_settings" ON public.app_settings;
DROP POLICY IF EXISTS app_settings_select_authenticated ON public.app_settings;
DROP POLICY IF EXISTS app_settings_admin_insert ON public.app_settings;
DROP POLICY IF EXISTS app_settings_admin_update ON public.app_settings;
DROP POLICY IF EXISTS app_settings_admin_delete ON public.app_settings;

CREATE POLICY app_settings_select_authenticated
  ON public.app_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY app_settings_admin_insert
  ON public.app_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.clearance_level = 'admin'
    )
  );

CREATE POLICY app_settings_admin_update
  ON public.app_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.clearance_level = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.clearance_level = 'admin'
    )
  );

CREATE POLICY app_settings_admin_delete
  ON public.app_settings FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.clearance_level = 'admin'
    )
  );

INSERT INTO public.app_settings (key, value)
VALUES ('business_name', 'Luxus Travel and Tours')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS single_supplement_pct numeric(5, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS supplier_id uuid,
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
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'routes'
      AND column_name = 'package_id'
  ) THEN
    ALTER TABLE public.routes ALTER COLUMN package_id DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'packages'
      AND column_name = 'supplier_id'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'routes'
      AND column_name = 'package_id'
  ) THEN
    UPDATE public.routes AS route
    SET supplier_id = package.supplier_id
    FROM public.packages AS package
    WHERE route.supplier_id IS NULL
      AND route.package_id = package.id
      AND package.supplier_id IS NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'routes_supplier_id_fkey'
  ) THEN
    ALTER TABLE public.routes
      ADD CONSTRAINT routes_supplier_id_fkey
      FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'routes_transport_service_type_check'
  ) THEN
    ALTER TABLE public.routes
      ADD CONSTRAINT routes_transport_service_type_check
      CHECK (transport_service_type IS NULL OR transport_service_type IN ('transfer', 'rental'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_routes_supplier_id ON public.routes (supplier_id);

ALTER TABLE public.suite_types
  ADD COLUMN IF NOT EXISTS passenger_capacity integer,
  ADD COLUMN IF NOT EXISTS luggage_capacity integer,
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.rate_cards
  ADD COLUMN IF NOT EXISTS child_price numeric(12,2) NULL,
  ADD COLUMN IF NOT EXISTS infant_price numeric(12,2) NULL,
  ALTER COLUMN route_id SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rate_cards'
      AND column_name = 'package_id'
  ) THEN
    ALTER TABLE public.rate_cards ALTER COLUMN package_id DROP NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rate_cards_route_suite
  ON public.rate_cards (route_id, suite_type_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rate_cards_route_suite_valid_from
  ON public.rate_cards (route_id, suite_type_id, valid_from);

NOTIFY pgrst, 'reload schema';
