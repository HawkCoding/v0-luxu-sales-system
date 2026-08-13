-- Tour operators price the tour type (suite_types), not the itinerary (routes).
--
-- A tour-operator rate card is therefore route-agnostic: rate_cards.route_id becomes nullable and
-- NULL reads as "applies to every itinerary of this supplier". Every other supplier kind keeps
-- route x suite type pricing, so their rate cards keep a route_id and are untouched here.
--
-- Itineraries in turn become descriptive: each one belongs to exactly one tour type and carries
-- its own description.

-- 1. Itinerary -> tour type link + itinerary description.
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS suite_type_id uuid,
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.routes
  DROP CONSTRAINT IF EXISTS routes_suite_type_id_fkey;

ALTER TABLE public.routes
  ADD CONSTRAINT routes_suite_type_id_fkey
  FOREIGN KEY (suite_type_id) REFERENCES public.suite_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_routes_suite_type_id
  ON public.routes (suite_type_id);

-- 2. Route-agnostic rate cards.
ALTER TABLE public.rate_cards
  ALTER COLUMN route_id DROP NOT NULL;

-- 3. NULL route ids must still collide with each other, which a bare `route_id WITH =` would not
-- do (NULLs never conflict in an exclusion constraint, and a plain unique index treats every NULL
-- as distinct). COALESCE onto the zero uuid, the same idiom the pre-rate-type version of this
-- constraint used in 20260317100000_add_rate_card_overlap_constraint.sql.
ALTER TABLE public.rate_cards
  DROP CONSTRAINT IF EXISTS no_overlapping_rate_cards;

ALTER TABLE public.rate_cards
  ADD CONSTRAINT no_overlapping_rate_cards
  EXCLUDE USING gist (
    rate_type_id WITH =,
    (COALESCE(route_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
    suite_type_id WITH =,
    daterange(valid_from, COALESCE(valid_to, 'infinity'::date), '[]') WITH &&
  );

DROP INDEX IF EXISTS public.ux_rate_cards_rate_type_route_suite_valid_from;
CREATE UNIQUE INDEX IF NOT EXISTS ux_rate_cards_rate_type_route_suite_valid_from
  ON public.rate_cards (
    rate_type_id,
    (COALESCE(route_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    suite_type_id,
    valid_from
  );

-- 4a. Point every existing tour-operator itinerary at that supplier's first tour type. Managers
-- correct the assignment in the UI; the column is only required going forward, so legacy rows
-- without a tour type would otherwise be unreachable from the grouped Itineraries card.
UPDATE public.routes AS r
SET suite_type_id = first_type.id
FROM public.suppliers AS s
CROSS JOIN LATERAL (
  SELECT st.id
  FROM public.suite_types AS st
  WHERE st.supplier_id = s.id
  ORDER BY st.sort_order, st.created_at, st.id
  LIMIT 1
) AS first_type
WHERE r.supplier_id = s.id
  AND s.kind = 'tour_operator'
  AND r.suite_type_id IS NULL;

-- 4b. Collapse the per-itinerary rate cards a tour operator has today down to the prices captured
-- against its first itinerary, and drop every other itinerary's cards. Keeping one whole
-- itinerary's set (rather than merging period by period) is what guarantees the survivors can't
-- overlap each other once they all become route-agnostic: they already coexisted under the same
-- constraint. The losers go first so the constraint never sees two NULL-route cards for the same
-- envelope mid-statement.
WITH first_route AS (
  SELECT DISTINCT ON (rt.supplier_id) rt.supplier_id, rt.id
  FROM public.routes AS rt
  JOIN public.suppliers AS s ON s.id = rt.supplier_id
  WHERE s.kind = 'tour_operator'
  ORDER BY rt.supplier_id, rt.created_at, rt.id
)
DELETE FROM public.rate_cards AS rc
USING public.routes AS rt
JOIN first_route AS fr ON fr.supplier_id = rt.supplier_id
WHERE rc.route_id = rt.id
  AND rt.id <> fr.id;

UPDATE public.rate_cards AS rc
SET route_id = NULL
FROM public.routes AS rt
JOIN public.suppliers AS s ON s.id = rt.supplier_id
WHERE rc.route_id = rt.id
  AND s.kind = 'tour_operator';
