DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bookings'
      AND column_name = 'cancel_reason'
  ) THEN
    ALTER TABLE public.bookings ADD COLUMN cancel_reason text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bookings'
      AND column_name = 'cancelled_at'
  ) THEN
    ALTER TABLE public.bookings ADD COLUMN cancelled_at timestamptz;
  END IF;
END $$;
