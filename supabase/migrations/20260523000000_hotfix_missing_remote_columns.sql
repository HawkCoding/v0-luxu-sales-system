-- Hotfix: columns present locally but missing from remote due to out-of-band local changes

ALTER TABLE public.suite_types
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS transport_service_type text,
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

NOTIFY pgrst, 'reload schema';
