-- Ensure supplier_kind enum supports the vehicle rental option before later migrations use it.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'supplier_kind'
      AND e.enumlabel = 'vehicle_rental'
  ) THEN
    ALTER TYPE public.supplier_kind ADD VALUE 'vehicle_rental';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
