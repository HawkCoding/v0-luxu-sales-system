-- Snapshot of the traveller counts as first captured from the enquiry (email/paste import or
-- manual entry), kept separate from no_of_adults/no_of_children so those can be edited later in
-- the pipeline without losing what the customer originally asked for. Backfilled from the current
-- values for existing bookings. Idempotent so it can be applied to local databases in any state.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS no_of_adults_original integer,
  ADD COLUMN IF NOT EXISTS no_of_children_original integer;

UPDATE public.bookings
SET
  no_of_adults_original = no_of_adults,
  no_of_children_original = no_of_children
WHERE no_of_adults_original IS NULL;

ALTER TABLE public.bookings
  ALTER COLUMN no_of_adults_original SET DEFAULT 1,
  ALTER COLUMN no_of_adults_original SET NOT NULL,
  ALTER COLUMN no_of_children_original SET DEFAULT 0,
  ALTER COLUMN no_of_children_original SET NOT NULL;
