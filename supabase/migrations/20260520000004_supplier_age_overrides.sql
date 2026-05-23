-- Phase 1: per-supplier age band overrides (NULL = inherit app_settings default)
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS infant_max_age integer,
  ADD COLUMN IF NOT EXISTS child_max_age  integer;

ALTER TABLE public.suppliers
  DROP CONSTRAINT IF EXISTS suppliers_infant_max_age_range;
ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_infant_max_age_range
  CHECK (infant_max_age IS NULL OR (infant_max_age >= 0 AND infant_max_age <= 17));

ALTER TABLE public.suppliers
  DROP CONSTRAINT IF EXISTS suppliers_child_max_age_range;
ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_child_max_age_range
  CHECK (child_max_age IS NULL OR (child_max_age >= 0 AND child_max_age <= 17));

ALTER TABLE public.suppliers
  DROP CONSTRAINT IF EXISTS suppliers_age_band_order;
ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_age_band_order
  CHECK (infant_max_age IS NULL OR child_max_age IS NULL OR infant_max_age <= child_max_age);
