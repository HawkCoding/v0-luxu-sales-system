-- Phase 1: per-supplier suite variant vocabulary (bedroom types, bedroom layouts, bathroom types)
-- + M:N joins from suite_types.

-- Bedroom Types vocabulary
CREATE TABLE IF NOT EXISTS public.bedroom_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bedroom_types_supplier_name_unique UNIQUE (supplier_id, name)
);

CREATE INDEX IF NOT EXISTS bedroom_types_supplier_sort_idx
  ON public.bedroom_types (supplier_id, sort_order);

ALTER TABLE public.bedroom_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ref_select" ON public.bedroom_types;
CREATE POLICY "ref_select" ON public.bedroom_types
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ref_insert" ON public.bedroom_types;
CREATE POLICY "ref_insert" ON public.bedroom_types
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));

DROP POLICY IF EXISTS "ref_update" ON public.bedroom_types;
CREATE POLICY "ref_update" ON public.bedroom_types
  FOR UPDATE TO authenticated
  USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
  WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));

DROP POLICY IF EXISTS "ref_delete" ON public.bedroom_types;
CREATE POLICY "ref_delete" ON public.bedroom_types
  FOR DELETE TO authenticated
  USING (public.auth_has_role(ARRAY['admin'::public.user_role]));

-- Bedroom Layouts vocabulary
CREATE TABLE IF NOT EXISTS public.bedroom_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bedroom_layouts_supplier_name_unique UNIQUE (supplier_id, name)
);

CREATE INDEX IF NOT EXISTS bedroom_layouts_supplier_sort_idx
  ON public.bedroom_layouts (supplier_id, sort_order);

ALTER TABLE public.bedroom_layouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ref_select" ON public.bedroom_layouts;
CREATE POLICY "ref_select" ON public.bedroom_layouts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ref_insert" ON public.bedroom_layouts;
CREATE POLICY "ref_insert" ON public.bedroom_layouts
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));

DROP POLICY IF EXISTS "ref_update" ON public.bedroom_layouts;
CREATE POLICY "ref_update" ON public.bedroom_layouts
  FOR UPDATE TO authenticated
  USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
  WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));

DROP POLICY IF EXISTS "ref_delete" ON public.bedroom_layouts;
CREATE POLICY "ref_delete" ON public.bedroom_layouts
  FOR DELETE TO authenticated
  USING (public.auth_has_role(ARRAY['admin'::public.user_role]));

-- Bathroom Types vocabulary
CREATE TABLE IF NOT EXISTS public.bathroom_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bathroom_types_supplier_name_unique UNIQUE (supplier_id, name)
);

CREATE INDEX IF NOT EXISTS bathroom_types_supplier_sort_idx
  ON public.bathroom_types (supplier_id, sort_order);

ALTER TABLE public.bathroom_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ref_select" ON public.bathroom_types;
CREATE POLICY "ref_select" ON public.bathroom_types
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ref_insert" ON public.bathroom_types;
CREATE POLICY "ref_insert" ON public.bathroom_types
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));

DROP POLICY IF EXISTS "ref_update" ON public.bathroom_types;
CREATE POLICY "ref_update" ON public.bathroom_types
  FOR UPDATE TO authenticated
  USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
  WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));

DROP POLICY IF EXISTS "ref_delete" ON public.bathroom_types;
CREATE POLICY "ref_delete" ON public.bathroom_types
  FOR DELETE TO authenticated
  USING (public.auth_has_role(ARRAY['admin'::public.user_role]));

-- M:N joins
CREATE TABLE IF NOT EXISTS public.suite_type_bedroom_types (
  suite_type_id uuid NOT NULL REFERENCES public.suite_types(id) ON DELETE CASCADE,
  bedroom_type_id uuid NOT NULL REFERENCES public.bedroom_types(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (suite_type_id, bedroom_type_id)
);
CREATE INDEX IF NOT EXISTS suite_type_bedroom_types_value_idx
  ON public.suite_type_bedroom_types (bedroom_type_id);
ALTER TABLE public.suite_type_bedroom_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ref_select" ON public.suite_type_bedroom_types;
CREATE POLICY "ref_select" ON public.suite_type_bedroom_types
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ref_write" ON public.suite_type_bedroom_types;
CREATE POLICY "ref_write" ON public.suite_type_bedroom_types
  FOR ALL TO authenticated
  USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
  WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));

CREATE TABLE IF NOT EXISTS public.suite_type_bedroom_layouts (
  suite_type_id uuid NOT NULL REFERENCES public.suite_types(id) ON DELETE CASCADE,
  bedroom_layout_id uuid NOT NULL REFERENCES public.bedroom_layouts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (suite_type_id, bedroom_layout_id)
);
CREATE INDEX IF NOT EXISTS suite_type_bedroom_layouts_value_idx
  ON public.suite_type_bedroom_layouts (bedroom_layout_id);
ALTER TABLE public.suite_type_bedroom_layouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ref_select" ON public.suite_type_bedroom_layouts;
CREATE POLICY "ref_select" ON public.suite_type_bedroom_layouts
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ref_write" ON public.suite_type_bedroom_layouts;
CREATE POLICY "ref_write" ON public.suite_type_bedroom_layouts
  FOR ALL TO authenticated
  USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
  WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));

CREATE TABLE IF NOT EXISTS public.suite_type_bathroom_types (
  suite_type_id uuid NOT NULL REFERENCES public.suite_types(id) ON DELETE CASCADE,
  bathroom_type_id uuid NOT NULL REFERENCES public.bathroom_types(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (suite_type_id, bathroom_type_id)
);
CREATE INDEX IF NOT EXISTS suite_type_bathroom_types_value_idx
  ON public.suite_type_bathroom_types (bathroom_type_id);
ALTER TABLE public.suite_type_bathroom_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ref_select" ON public.suite_type_bathroom_types;
CREATE POLICY "ref_select" ON public.suite_type_bathroom_types
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ref_write" ON public.suite_type_bathroom_types;
CREATE POLICY "ref_write" ON public.suite_type_bathroom_types
  FOR ALL TO authenticated
  USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
  WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));
