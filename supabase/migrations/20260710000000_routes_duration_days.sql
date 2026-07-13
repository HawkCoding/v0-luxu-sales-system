-- Per-route trip length in days (train routes: e.g. Pretoria -> Cape Town = 2)
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS duration_days integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'routes_duration_days_positive'
  ) THEN
    ALTER TABLE public.routes
      ADD CONSTRAINT routes_duration_days_positive
      CHECK (duration_days IS NULL OR duration_days >= 1);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
