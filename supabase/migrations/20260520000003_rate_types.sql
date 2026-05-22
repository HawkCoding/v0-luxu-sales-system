-- Phase 1: rate_types (org-wide) + rate_cards.rate_type_id

CREATE TABLE IF NOT EXISTS public.rate_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rate_types_sort_idx
  ON public.rate_types (sort_order)
  WHERE archived_at IS NULL;

ALTER TABLE public.rate_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ref_select" ON public.rate_types;
CREATE POLICY "ref_select" ON public.rate_types
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ref_insert" ON public.rate_types;
CREATE POLICY "ref_insert" ON public.rate_types
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));

DROP POLICY IF EXISTS "ref_update" ON public.rate_types;
CREATE POLICY "ref_update" ON public.rate_types
  FOR UPDATE TO authenticated
  USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
  WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));

DROP POLICY IF EXISTS "ref_delete" ON public.rate_types;
CREATE POLICY "ref_delete" ON public.rate_types
  FOR DELETE TO authenticated
  USING (public.auth_has_role(ARRAY['admin'::public.user_role]));

-- Seed canonical rate types
INSERT INTO public.rate_types (code, name, sort_order, is_default) VALUES
  ('RAC',      'Rack Rate',             0, true),
  ('STO',      'Standard Tour Operator',1, false),
  ('NETT',     'Nett Rate',             2, false),
  ('RESIDENT', 'Resident Rate',         3, false)
ON CONFLICT (code) DO NOTHING;

-- Attach rate_cards to a rate_type. New inserts default to the canonical
-- `is_default = true` rate type so existing call sites keep working until
-- Phase 5 surfaces the picker in the UI.
CREATE OR REPLACE FUNCTION public.default_rate_type_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT id
    FROM public.rate_types
   WHERE is_default = true
     AND archived_at IS NULL
   ORDER BY sort_order
   LIMIT 1
$$;

ALTER TABLE public.rate_cards
  ADD COLUMN IF NOT EXISTS rate_type_id uuid REFERENCES public.rate_types(id);

ALTER TABLE public.rate_cards
  ALTER COLUMN rate_type_id SET DEFAULT public.default_rate_type_id();

-- Backfill existing rate_cards to the default (RAC)
UPDATE public.rate_cards
   SET rate_type_id = public.default_rate_type_id()
 WHERE rate_type_id IS NULL;

ALTER TABLE public.rate_cards
  ALTER COLUMN rate_type_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rate_cards_rate_type
  ON public.rate_cards (rate_type_id);

-- Rewrite the EXCLUDE overlap constraint to scope by rate_type_id too,
-- so RAC / STO / NETT prices can coexist for the same envelope.
ALTER TABLE public.rate_cards
  DROP CONSTRAINT IF EXISTS no_overlapping_rate_cards;

ALTER TABLE public.rate_cards
  ADD CONSTRAINT no_overlapping_rate_cards
  EXCLUDE USING gist (
    rate_type_id WITH =,
    route_id WITH =,
    suite_type_id WITH =,
    daterange(valid_from, COALESCE(valid_to, 'infinity'::date), '[]') WITH &&
  );

-- Replace the rate-type-agnostic unique index too, so seed/UI can upsert per rate type.
DROP INDEX IF EXISTS public.ux_rate_cards_route_suite_valid_from;
CREATE UNIQUE INDEX IF NOT EXISTS ux_rate_cards_rate_type_route_suite_valid_from
  ON public.rate_cards (rate_type_id, route_id, suite_type_id, valid_from);
