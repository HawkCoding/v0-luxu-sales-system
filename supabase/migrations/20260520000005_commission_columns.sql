-- Phase 1: commission columns on suppliers (default) and routes (override)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'commission_kind') THEN
    CREATE TYPE public.commission_kind AS ENUM ('percent', 'per_person');
  END IF;
END $$;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS default_commission_type  public.commission_kind,
  ADD COLUMN IF NOT EXISTS default_commission_value numeric(10,2);

ALTER TABLE public.suppliers
  DROP CONSTRAINT IF EXISTS suppliers_default_commission_pair;
ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_default_commission_pair
  CHECK (
    (default_commission_type IS NULL AND default_commission_value IS NULL)
    OR (default_commission_type IS NOT NULL AND default_commission_value IS NOT NULL AND default_commission_value >= 0)
  );

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS commission_type  public.commission_kind,
  ADD COLUMN IF NOT EXISTS commission_value numeric(10,2);

ALTER TABLE public.routes
  DROP CONSTRAINT IF EXISTS routes_commission_pair;
ALTER TABLE public.routes
  ADD CONSTRAINT routes_commission_pair
  CHECK (
    (commission_type IS NULL AND commission_value IS NULL)
    OR (commission_type IS NOT NULL AND commission_value IS NOT NULL AND commission_value >= 0)
  );
