-- Collapse supplier location UI from three fields to two: free-text `location` is retired for
-- every kind except train_operator (a train has no single city, so it keeps free text as its
-- "head office city" -- see supplier_station_addresses for per-city boarding points). Everyone
-- else now carries only `location_id` (the City dropdown) + `street_address`.
--
-- Backfill in two passes before the text is discarded: an exact match against a top-level city,
-- then an exact match against a city's sub-area (location_area_id + its parent as location_id).
-- Whatever still doesn't match is logged via RAISE NOTICE and then dropped -- values like "CT" or
-- "V&A Waterfront, Cape Town" don't correspond to a single locations row and are not worth
-- guessing at; re-tag those suppliers manually via the City dropdown after this runs.

-- Pass 1: exact match against a top-level city.
UPDATE public.suppliers s
SET location_id = l.id
FROM public.locations l
WHERE s.kind <> 'train_operator'
  AND s.location_id IS NULL
  AND l.parent_location_id IS NULL
  AND lower(btrim(s.location)) = lower(l.name);

-- Pass 2: exact match against a sub-area; the sub-area itself becomes location_area_id, its
-- parent city becomes location_id -- matching how supplierMatchesDestination already reads both.
UPDATE public.suppliers s
SET location_area_id = l.id,
    location_id = l.parent_location_id
FROM public.locations l
WHERE s.kind <> 'train_operator'
  AND s.location_id IS NULL
  AND s.location_area_id IS NULL
  AND l.parent_location_id IS NOT NULL
  AND lower(btrim(s.location)) = lower(l.name);

-- Log what's about to be discarded so it can be manually re-applied via the City dropdown. This
-- is the only record of the discarded values -- capture the NOTICE output when this is applied.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT name, location
    FROM public.suppliers
    WHERE kind <> 'train_operator'
      AND location IS NOT NULL
      AND btrim(location) <> ''
  LOOP
    RAISE NOTICE 'supplier % had unmatched location %, discarded -- pick a city manually', r.name, r.location;
  END LOOP;
END $$;

-- Discard whatever free text didn't match a location row above.
UPDATE public.suppliers
SET location = NULL
WHERE kind <> 'train_operator';

COMMENT ON COLUMN public.suppliers.location IS
  'Free-text head office city -- train operators only. Every other kind resolves its city from location_id.';

-- location_detail has had no editor UI since 20260810160000 copied its data into street_address;
-- the suppliers list was the only remaining reader, and that read is being removed alongside this.
ALTER TABLE public.suppliers DROP COLUMN IF EXISTS location_detail;
