ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS assigned_salesperson_id uuid REFERENCES auth.users(id);

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS no_package_match boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_bookings_assigned_salesperson_id
  ON public.bookings(assigned_salesperson_id);

CREATE INDEX IF NOT EXISTS idx_quotes_no_package_match
  ON public.quotes(no_package_match)
  WHERE no_package_match = true;
