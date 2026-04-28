-- Flatten supplier structure: routes and rate_cards now belong to supplier directly.
-- Packages no longer act as an intermediate layer for the supplier editor.
-- Packages gain slug + multi-leg support via package_legs join table.

-- Restructure packages: drop direct supplier ownership, add slug
ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS slug text;

UPDATE public.packages
SET slug = lower(regexp_replace(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g'))
WHERE slug IS NULL OR btrim(slug) = '';

UPDATE public.packages
SET slug = 'package-' || left(id::text, 8)
WHERE slug IS NULL OR btrim(slug) = '';

WITH duplicate_slugs AS (
  SELECT id, slug, row_number() OVER (PARTITION BY slug ORDER BY created_at, id) AS duplicate_index
  FROM public.packages
)
UPDATE public.packages AS p
SET slug = p.slug || '-' || left(p.id::text, 8)
FROM duplicate_slugs AS d
WHERE p.id = d.id
  AND d.duplicate_index > 1;

ALTER TABLE public.packages
  ALTER COLUMN slug SET NOT NULL;

-- package_legs: connects a package to one or more suppliers
CREATE TABLE IF NOT EXISTS public.package_legs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  package_id uuid NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  label text,
  sort_order integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
ALTER TABLE public.package_legs ENABLE ROW LEVEL SECURITY;

INSERT INTO public.package_legs (package_id, supplier_id, label, sort_order, created_at)
SELECT p.id, p.supplier_id, p.name, 1, COALESCE(p.created_at, now())
FROM public.packages AS p
WHERE p.supplier_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.package_legs AS pl
    WHERE pl.package_id = p.id
      AND pl.supplier_id = p.supplier_id
  );

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE CASCADE;

UPDATE public.routes AS r
SET supplier_id = p.supplier_id
FROM public.packages AS p
WHERE r.supplier_id IS NULL
  AND r.package_id = p.id
  AND p.supplier_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.routes WHERE supplier_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot migrate routes to supplier ownership: at least one route has no package supplier.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.rate_cards WHERE route_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot migrate rate cards to route ownership: at least one rate card has no route.';
  END IF;
END $$;

-- Drop package-based constraints on routes
ALTER TABLE public.routes
  DROP CONSTRAINT IF EXISTS routes_package_id_fkey,
  DROP CONSTRAINT IF EXISTS routes_leg_id_fkey;
DROP INDEX IF EXISTS public.ux_routes_name_package;
DROP INDEX IF EXISTS public.ux_routes_name_leg;
DROP INDEX IF EXISTS public.idx_routes_package_id;
DROP INDEX IF EXISTS public.idx_routes_leg_id;

-- Drop package-based constraints on rate_cards
ALTER TABLE public.rate_cards
  DROP CONSTRAINT IF EXISTS rate_cards_package_id_fkey,
  DROP CONSTRAINT IF EXISTS rate_cards_leg_id_fkey;
DROP INDEX IF EXISTS public.ux_rate_cards_package_suite_route_valid_from;
DROP INDEX IF EXISTS public.ux_rate_cards_leg_suite_route_valid_from;
DROP INDEX IF EXISTS public.idx_rate_cards_package_suite;
DROP INDEX IF EXISTS public.idx_rate_cards_leg_suite;

-- Swap routes.package_id / routes.leg_id -> routes.supplier_id
ALTER TABLE public.routes
  DROP COLUMN IF EXISTS package_id,
  DROP COLUMN IF EXISTS leg_id;
ALTER TABLE public.routes ALTER COLUMN supplier_id SET NOT NULL;

-- Make rate_cards.route_id required, drop package/leg ownership
ALTER TABLE public.rate_cards
  DROP COLUMN IF EXISTS package_id,
  DROP COLUMN IF EXISTS leg_id,
  ALTER COLUMN route_id SET NOT NULL;

-- Make unique constraints DEFERRABLE so swap-renames work within one transaction
ALTER TABLE public.routes
  DROP CONSTRAINT IF EXISTS ux_routes_name_package,
  DROP CONSTRAINT IF EXISTS ux_routes_name_supplier;
ALTER TABLE public.routes
  ADD CONSTRAINT ux_routes_name_supplier
  UNIQUE (name, supplier_id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.suite_types
  DROP CONSTRAINT IF EXISTS ux_suite_types_name_supplier;
DROP INDEX IF EXISTS public.ux_suite_types_name_supplier;
ALTER TABLE public.suite_types
  ADD CONSTRAINT ux_suite_types_name_supplier
  UNIQUE (name, supplier_id) DEFERRABLE INITIALLY DEFERRED;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_routes_supplier_id ON public.routes (supplier_id);

-- Overlap constraint (scoped to route, not package)
ALTER TABLE public.rate_cards
  DROP CONSTRAINT IF EXISTS no_overlapping_rate_cards;
ALTER TABLE public.rate_cards
  ADD CONSTRAINT no_overlapping_rate_cards
  EXCLUDE USING gist (
    route_id WITH =,
    suite_type_id WITH =,
    daterange(valid_from, COALESCE(valid_to, 'infinity'::date), '[]') WITH &&
  );

CREATE INDEX IF NOT EXISTS idx_rate_cards_route_suite ON public.rate_cards (route_id, suite_type_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_rate_cards_route_suite_valid_from
  ON public.rate_cards (route_id, suite_type_id, valid_from);

ALTER TABLE public.packages
  DROP COLUMN IF EXISTS supplier_id;
