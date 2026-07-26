-- Per-supplier learned alias table for suite-type/config-axis matching from free-text enquiry
-- wording (e.g. "Deluxe Twin with shower"). One row per (supplier, axis, phrase); a single
-- correction of a composite phrase can write up to four rows, one per axis, sharing the same
-- phrase. Aliases are matched by EXACT normalized-phrase equality only -- never fuzzy-matched
-- themselves -- so a bad row can never spread to neighbouring wording. See lib/suites/.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'suite_alias_axis') THEN
    CREATE TYPE public.suite_alias_axis AS ENUM
      ('suite_type', 'bedroom_type', 'bedroom_layout', 'bathroom_type');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'suite_alias_status') THEN
    CREATE TYPE public.suite_alias_status AS ENUM ('provisional', 'confirmed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.suite_vocab_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  axis public.suite_alias_axis NOT NULL,
  -- Already normalized on write (lib/suites/suite-phrase-tokens.ts). Matched by exact
  -- equality only.
  phrase text NOT NULL,
  suite_type_id uuid REFERENCES public.suite_types(id) ON DELETE CASCADE,
  bedroom_type_id uuid REFERENCES public.bedroom_types(id) ON DELETE CASCADE,
  bedroom_layout_id uuid REFERENCES public.bedroom_layouts(id) ON DELETE CASCADE,
  bathroom_type_id uuid REFERENCES public.bathroom_types(id) ON DELETE CASCADE,
  status public.suite_alias_status NOT NULL DEFAULT 'provisional',
  hit_count integer NOT NULL DEFAULT 0,
  last_seen_at timestamptz,
  confirmed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT suite_vocab_aliases_phrase_not_blank CHECK (btrim(phrase) <> ''),
  CONSTRAINT suite_vocab_aliases_one_target CHECK (
    (suite_type_id IS NOT NULL)::int + (bedroom_type_id IS NOT NULL)::int +
    (bedroom_layout_id IS NOT NULL)::int + (bathroom_type_id IS NOT NULL)::int = 1
  ),
  CONSTRAINT suite_vocab_aliases_axis_matches_target CHECK (
    (axis = 'suite_type' AND suite_type_id IS NOT NULL) OR
    (axis = 'bedroom_type' AND bedroom_type_id IS NOT NULL) OR
    (axis = 'bedroom_layout' AND bedroom_layout_id IS NOT NULL) OR
    (axis = 'bathroom_type' AND bathroom_type_id IS NOT NULL)
  )
);

-- One mapping per (supplier, axis, normalized phrase). This *is* the "corrected again ->
-- replace" semantics: the write is an upsert ON CONFLICT that overwrites the target and
-- resets status back to 'provisional'.
CREATE UNIQUE INDEX IF NOT EXISTS suite_vocab_aliases_supplier_axis_phrase_key
  ON public.suite_vocab_aliases (supplier_id, axis, phrase);

CREATE INDEX IF NOT EXISTS suite_vocab_aliases_supplier_idx
  ON public.suite_vocab_aliases (supplier_id);

ALTER TABLE public.suite_vocab_aliases ENABLE ROW LEVEL SECURITY;

-- Read: every authenticated user -- the review modal runs the matcher client-side.
DROP POLICY IF EXISTS "ref_select" ON public.suite_vocab_aliases;
CREATE POLICY "ref_select" ON public.suite_vocab_aliases
  FOR SELECT TO authenticated USING (true);

-- No INSERT/UPDATE policy for `authenticated` on purpose: all learning writes go through
-- createServiceClient() server-side, which bypasses RLS as service_role.
DROP POLICY IF EXISTS "ref_delete" ON public.suite_vocab_aliases;
CREATE POLICY "ref_delete" ON public.suite_vocab_aliases
  FOR DELETE TO authenticated
  USING (public.auth_has_role(ARRAY['admin'::public.user_role]));

DROP TRIGGER IF EXISTS set_suite_vocab_aliases_updated_at ON public.suite_vocab_aliases;
CREATE TRIGGER set_suite_vocab_aliases_updated_at
  BEFORE UPDATE ON public.suite_vocab_aliases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT ALL ON TABLE public.suite_vocab_aliases TO anon;
GRANT ALL ON TABLE public.suite_vocab_aliases TO authenticated;
GRANT ALL ON TABLE public.suite_vocab_aliases TO service_role;

NOTIFY pgrst, 'reload schema';
