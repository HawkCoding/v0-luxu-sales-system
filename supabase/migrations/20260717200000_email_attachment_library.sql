-- Email attachment library: reusable files (reservation forms, suite layouts,
-- fact sheets, directions) uploaded once in Settings and selectable per
-- outgoing email. Files live in the existing `attachments` bucket under the
-- library/ prefix. supplier_id NULL = offered for every booking; set = only
-- offered when the booking's route belongs to that supplier. email_kinds
-- holds correspondence kinds ('quote', 'invoice', ...) the file is
-- pre-selected for.
-- Idempotent — safe to run on existing databases.

CREATE TABLE IF NOT EXISTS public.email_attachment_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  content_type text NOT NULL,
  file_size integer NOT NULL DEFAULT 0,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  email_kinds text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_attachment_library_supplier_idx
  ON public.email_attachment_library(supplier_id);

ALTER TABLE public.email_attachment_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_attachment_library_select ON public.email_attachment_library;
CREATE POLICY email_attachment_library_select ON public.email_attachment_library
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS email_attachment_library_insert ON public.email_attachment_library;
CREATE POLICY email_attachment_library_insert ON public.email_attachment_library
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.clearance_level IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS email_attachment_library_update ON public.email_attachment_library;
CREATE POLICY email_attachment_library_update ON public.email_attachment_library
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.clearance_level IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS email_attachment_library_delete ON public.email_attachment_library;
CREATE POLICY email_attachment_library_delete ON public.email_attachment_library
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.clearance_level IN ('admin', 'manager')
    )
  );
