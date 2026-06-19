-- Customers can carry a default rate type (e.g. Resident vs Rack), used to
-- pre-select the rate version when applying a package to a quote. Nullable:
-- when unset, the quote falls back to the system default rate type.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS default_rate_type_id uuid REFERENCES public.rate_types(id);

CREATE INDEX IF NOT EXISTS idx_customers_default_rate_type
  ON public.customers (default_rate_type_id)
  WHERE default_rate_type_id IS NOT NULL;
