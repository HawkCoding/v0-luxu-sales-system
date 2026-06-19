-- Remove supplier-level default commission and per-route commission.
-- Commission can still be overridden per leg when applying a package (stored in pricing snapshots).

ALTER TABLE public.suppliers
  DROP COLUMN IF EXISTS default_commission_type,
  DROP COLUMN IF EXISTS default_commission_value;

ALTER TABLE public.routes
  DROP COLUMN IF EXISTS commission_type,
  DROP COLUMN IF EXISTS commission_value;

-- commission_kind enum is no longer used by any column
DROP TYPE IF EXISTS public.commission_kind;
