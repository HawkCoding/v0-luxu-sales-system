-- Replace the global name uniqueness on locations with two partial indexes:
--   1) Top-level cities must have unique names among themselves
--   2) Sub-areas must have unique names within their parent city
DROP INDEX IF EXISTS public."ux_locations_name";

-- Self-referential FK: a location can optionally belong to a parent city
-- NOTE: column must be added before the partial indexes that reference it
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS parent_location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS ux_locations_name_toplevel
  ON public.locations (name)
  WHERE parent_location_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_locations_name_area
  ON public.locations (name, parent_location_id)
  WHERE parent_location_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS locations_parent_location_id_idx
  ON public.locations (parent_location_id);

-- Sub-area FK on suppliers: which area within the city does this supplier operate in
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS location_area_id uuid REFERENCES public.locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS suppliers_location_area_id_idx
  ON public.suppliers (location_area_id);

-- Seed initial sub-areas for Cape Town
INSERT INTO public.locations (name, country, region_code, parent_location_id)
SELECT a.name, 'South Africa', 'ZA-WC', l.id
FROM public.locations l
CROSS JOIN (VALUES
  ('CBD'),
  ('Waterfront'),
  ('Newlands'),
  ('Sea Point')
) AS a(name)
WHERE l.name = 'Cape Town' AND l.parent_location_id IS NULL
ON CONFLICT DO NOTHING;

-- Seed initial sub-areas for Pretoria
INSERT INTO public.locations (name, country, region_code, parent_location_id)
SELECT a.name, 'South Africa', 'ZA-GP', l.id
FROM public.locations l
CROSS JOIN (VALUES
  ('CBD'),
  ('Hatfield'),
  ('Menlyn'),
  ('Brooklyn')
) AS a(name)
WHERE l.name = 'Pretoria' AND l.parent_location_id IS NULL
ON CONFLICT DO NOTHING;

-- Seed initial sub-areas for Durban
INSERT INTO public.locations (name, country, region_code, parent_location_id)
SELECT a.name, 'South Africa', 'ZA-KZN', l.id
FROM public.locations l
CROSS JOIN (VALUES
  ('CBD'),
  ('Umhlanga')
) AS a(name)
WHERE l.name = 'Durban' AND l.parent_location_id IS NULL
ON CONFLICT DO NOTHING;
