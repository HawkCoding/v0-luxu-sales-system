ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS default_time_start time,
  ADD COLUMN IF NOT EXISTS default_time_end time;

NOTIFY pgrst, 'reload schema';
