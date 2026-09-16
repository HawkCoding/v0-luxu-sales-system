-- The quote itinerary's train line now states a separate "Check in at …" bullet ahead of
-- "Departure time: …" instead of a bare "Departs at …" suffix. How far ahead of departure that
-- check-in time sits is an operator fact (Blue Train and Rovos Rail may differ), so it is
-- captured per supplier rather than assumed in code. 0 means the operator publishes no check-in
-- time at all, so the quote falls back to its old single "Departs at …" wording. Defaults to 120
-- (two hours) -- the assumption baked into the reviewer's markup -- so every existing train
-- supplier gets the new two-line wording without anyone having to configure it first.
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS check_in_offset_minutes integer NOT NULL DEFAULT 120;

ALTER TABLE public.suppliers
  DROP CONSTRAINT IF EXISTS suppliers_check_in_offset_minutes_range;

ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_check_in_offset_minutes_range
  CHECK (check_in_offset_minutes BETWEEN 0 AND 720);
