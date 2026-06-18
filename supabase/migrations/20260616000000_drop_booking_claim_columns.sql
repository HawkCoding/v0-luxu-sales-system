-- Merge the "Claimed by" axis into the single "Salesperson" (assigned_salesperson_id) axis.
-- The claim columns were a self-serve operational flag that fed nothing downstream;
-- reporting and ownership now use assigned_salesperson_id exclusively.

DROP INDEX IF EXISTS public.idx_bookings_claimed_by_user_id;

ALTER TABLE public.bookings
  DROP COLUMN IF EXISTS claimed_by_user_id,
  DROP COLUMN IF EXISTS claimed_at;
