-- Per-supplier-kind document copy overrides. The global app_settings values (quote_doc_footer_text,
-- brand_block_subheading, etc.) are all written as rail marketing copy -- accurate for a Rovos or
-- Blue Train quote, wrong for a standalone stay like Kruger Shalati ("Luxury Rail Journeys" on a
-- hotel booking with no train at all). Rather than force every supplier kind to answer in code
-- (a deploy for a wording tweak), each document string can carry an optional per-kind row here;
-- an absent row falls back to the existing global app_settings value, so an empty table reproduces
-- today's output exactly. Modelled on supplier_kind_default_rate_types (see
-- 20260617000100_supplier_kind_default_rate_types.sql), the other per-kind settings table.

CREATE TABLE IF NOT EXISTS public.supplier_kind_document_text (
  kind       text NOT NULL,
  key        text NOT NULL,
  value      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, key)
);

ALTER TABLE public.supplier_kind_document_text ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "skdt_select" ON public.supplier_kind_document_text;
CREATE POLICY "skdt_select" ON public.supplier_kind_document_text
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "skdt_insert" ON public.supplier_kind_document_text;
CREATE POLICY "skdt_insert" ON public.supplier_kind_document_text
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));

DROP POLICY IF EXISTS "skdt_update" ON public.supplier_kind_document_text;
CREATE POLICY "skdt_update" ON public.supplier_kind_document_text
  FOR UPDATE TO authenticated
  USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
  WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));

DROP POLICY IF EXISTS "skdt_delete" ON public.supplier_kind_document_text;
CREATE POLICY "skdt_delete" ON public.supplier_kind_document_text
  FOR DELETE TO authenticated
  USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));

-- No seed data: every kind inherits the global wording until someone opens Settings and types an
-- override, which is the point -- nothing here can silently disagree with app_settings on day one.
