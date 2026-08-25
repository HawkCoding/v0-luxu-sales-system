-- Structured, taggable replacement for the flat suppliers.inclusions / exclusions
-- text[] lists. Each row is one bullet or subheading; journey_tag / rate_tag are
-- optional filters applied at render time (lib/inclusions/filter-lines.ts). An
-- item with no tag of its own inherits the nearest preceding heading's tag on
-- that axis -- untagged rows (the common case, e.g. Blue Train) always show.
--
-- suppliers.inclusions / exclusions are left in place and unread by this change,
-- so rollback is a one-line revert of the read path.

CREATE TABLE IF NOT EXISTS public.supplier_inclusion_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  list text NOT NULL CHECK (list IN ('inclusions', 'exclusions')),
  kind text NOT NULL CHECK (kind IN ('heading', 'item')),
  text text NOT NULL,
  journey_tag text CHECK (journey_tag IN ('short', 'long')),
  rate_tag text CHECK (rate_tag IN ('international', 'resident')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_inclusion_lines_supplier
  ON public.supplier_inclusion_lines (supplier_id, list, sort_order);

DROP TRIGGER IF EXISTS trg_updated_at_supplier_inclusion_lines ON public.supplier_inclusion_lines;
CREATE TRIGGER trg_updated_at_supplier_inclusion_lines
  BEFORE UPDATE ON public.supplier_inclusion_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Backfill from the existing arrays, preserving order. A leading '#' marks a
-- heading, same convention as lib/inclusions/bullet-lines.ts; the marker is
-- stripped and every tag starts NULL (untagged = always shown).
INSERT INTO public.supplier_inclusion_lines (supplier_id, list, kind, text, sort_order)
SELECT s.id,
       'inclusions',
       CASE WHEN trim(line) ~ '^#+\s*' THEN 'heading' ELSE 'item' END,
       trim(regexp_replace(trim(line), '^#+\s*', '')),
       ord - 1
FROM public.suppliers s,
     unnest(s.inclusions) WITH ORDINALITY AS t(line, ord)
WHERE trim(line) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.supplier_inclusion_lines existing
    WHERE existing.supplier_id = s.id AND existing.list = 'inclusions'
  );

INSERT INTO public.supplier_inclusion_lines (supplier_id, list, kind, text, sort_order)
SELECT s.id,
       'exclusions',
       CASE WHEN trim(line) ~ '^#+\s*' THEN 'heading' ELSE 'item' END,
       trim(regexp_replace(trim(line), '^#+\s*', '')),
       ord - 1
FROM public.suppliers s,
     unnest(s.exclusions) WITH ORDINALITY AS t(line, ord)
WHERE trim(line) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.supplier_inclusion_lines existing
    WHERE existing.supplier_id = s.id AND existing.list = 'exclusions'
  );

ALTER TABLE public.supplier_inclusion_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ref_select ON public.supplier_inclusion_lines;
CREATE POLICY ref_select ON public.supplier_inclusion_lines
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS ref_insert ON public.supplier_inclusion_lines;
CREATE POLICY ref_insert ON public.supplier_inclusion_lines
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));

DROP POLICY IF EXISTS ref_update ON public.supplier_inclusion_lines;
CREATE POLICY ref_update ON public.supplier_inclusion_lines
  FOR UPDATE TO authenticated
  USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
  WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));

DROP POLICY IF EXISTS ref_delete ON public.supplier_inclusion_lines;
CREATE POLICY ref_delete ON public.supplier_inclusion_lines
  FOR DELETE TO authenticated
  USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));

GRANT ALL ON TABLE public.supplier_inclusion_lines TO anon;
GRANT ALL ON TABLE public.supplier_inclusion_lines TO authenticated;
GRANT ALL ON TABLE public.supplier_inclusion_lines TO service_role;

NOTIFY pgrst, 'reload schema';
