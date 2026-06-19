-- Add job-claiming columns to bookings.
-- claimed_by_user_id / claimed_at are the consultant self-serve axis:
--   • consultants can claim unclaimed jobs (sets both columns)
--   • consultants can release only their own claim (clears both)
--   • managers/admins can claim/release/reassign any job
-- owner_user_id stays as the immutable original creator.
-- assigned_salesperson_id stays as the manager-assignment axis.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS claimed_by_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_bookings_claimed_by_user_id
  ON public.bookings(claimed_by_user_id);

-- RLS: anyone with clearance can read; write is handled at the API layer
-- (the existing RLS policies already allow admin/manager/consultant to
--  update bookings rows they can see, so no new policies needed here).
