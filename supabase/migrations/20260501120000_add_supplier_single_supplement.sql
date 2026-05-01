ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS single_supplement_pct numeric(5, 2) NOT NULL DEFAULT 0;
