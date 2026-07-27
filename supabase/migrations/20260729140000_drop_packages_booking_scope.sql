-- Closes out the booking_services migration (20260729100000): now that Build Booking creates
-- booking_services rows directly instead of a "hidden" per-booking packages row, packages.booking_id
-- has no more writers anywhere in the app (confirmed: nothing inserts into packages with a
-- booking_id set). Dropping it removes the leak class the column always carried -- every
-- catalogue-package list/browse query had to remember to filter booking_id IS NULL to avoid
-- surfacing these rows; now there is nothing to filter.
--
-- Any pre-cutover hidden package rows were already migrated into booking_services by
-- 20260729100000's backfill, so this is safe to run without a further data migration.
DROP INDEX IF EXISTS public.packages_booking_id_key;

ALTER TABLE public.packages
  DROP COLUMN IF EXISTS booking_id;

NOTIFY pgrst, 'reload schema';
