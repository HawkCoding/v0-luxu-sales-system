-- Phase 11: Booking outcome lifecycle
-- Creates outcome_reasons lookup table and adds outcome fields to bookings.

-- 1. outcome_reasons reference table
CREATE TABLE IF NOT EXISTS public.outcome_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  applies_to text NOT NULL CHECK (applies_to IN ('Lost', 'Cancelled', 'Both')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.outcome_reasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read outcome_reasons" ON public.outcome_reasons;
CREATE POLICY "Authenticated users can read outcome_reasons"
  ON public.outcome_reasons FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Managers can manage outcome_reasons" ON public.outcome_reasons;
CREATE POLICY "Managers can manage outcome_reasons"
  ON public.outcome_reasons FOR ALL
  TO authenticated
  USING (
    (auth.jwt() ->> 'clearance_level') IN ('manager', 'admin')
  )
  WITH CHECK (
    (auth.jwt() ->> 'clearance_level') IN ('manager', 'admin')
  );

-- 2. Add outcome field to bookings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'outcome'
  ) THEN
    ALTER TABLE public.bookings
      ADD COLUMN outcome text NOT NULL DEFAULT 'Open'
        CHECK (outcome IN ('Open', 'Won', 'Lost', 'Cancelled'));
  END IF;
END $$;

-- 3. outcome_reason_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'outcome_reason_id'
  ) THEN
    ALTER TABLE public.bookings
      ADD COLUMN outcome_reason_id uuid REFERENCES public.outcome_reasons(id);
  END IF;
END $$;

-- 4. outcome_notes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'outcome_notes'
  ) THEN
    ALTER TABLE public.bookings ADD COLUMN outcome_notes text;
  END IF;
END $$;

-- 5. outcome_set_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'outcome_set_at'
  ) THEN
    ALTER TABLE public.bookings ADD COLUMN outcome_set_at timestamptz;
  END IF;
END $$;

-- 6. outcome_set_by
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'outcome_set_by'
  ) THEN
    ALTER TABLE public.bookings
      ADD COLUMN outcome_set_by uuid REFERENCES auth.users(id);
  END IF;
END $$;
