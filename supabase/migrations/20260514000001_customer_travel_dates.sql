ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS first_travel_date date,
  ADD COLUMN IF NOT EXISTS last_travel_date  date;
