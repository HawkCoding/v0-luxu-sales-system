DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'pipeline_stage'
      AND e.enumlabel = 'form_done'
  ) THEN
    ALTER TYPE public.pipeline_stage ADD VALUE 'form_done';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'pipeline_stage'
      AND e.enumlabel = 'payment_schedule'
  ) THEN
    ALTER TYPE public.pipeline_stage ADD VALUE 'payment_schedule';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'pipeline_stage'
      AND e.enumlabel = 'trip_active'
  ) THEN
    ALTER TYPE public.pipeline_stage ADD VALUE 'trip_active';
  END IF;
END $$;
