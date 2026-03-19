CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.rate_cards
ADD CONSTRAINT no_overlapping_rate_cards
EXCLUDE USING gist (
  package_id WITH =,
  suite_type_id WITH =,
  (COALESCE(route_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
  daterange(valid_from, valid_to, '[)') WITH &&
);
