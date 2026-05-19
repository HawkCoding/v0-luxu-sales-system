-- Phase 21 / Phase 29: general attachments + internal booking notes.
-- Idempotent — safe to run on existing databases.
-- Note: document_kind enum's `proof_of_payment` value is added in the prior
-- migration (must commit before use).

-- ---------------------------------------------------------------
-- 1. Extend documents: file_name, uploaded_by, payment_id.
--    Columns nullable on the table so legacy generator rows still validate.
--    The general upload API enforces NOT NULL in code.
-- ---------------------------------------------------------------
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS uploaded_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES public.payments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS documents_payment_id_idx ON public.documents(payment_id);

UPDATE public.documents
SET file_name = regexp_replace(storage_path, '.*/', '')
WHERE file_name IS NULL AND storage_path IS NOT NULL;

-- ---------------------------------------------------------------
-- 3. Extend bookings with supplier_reference (overall supplier confirmation #).
-- ---------------------------------------------------------------
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS supplier_reference text;

-- ---------------------------------------------------------------
-- 4. booking_notes — internal notes thread per booking.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_notes_booking_id_idx ON public.booking_notes(booking_id);

ALTER TABLE public.booking_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_notes_select ON public.booking_notes;
CREATE POLICY booking_notes_select ON public.booking_notes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS booking_notes_insert ON public.booking_notes;
CREATE POLICY booking_notes_insert ON public.booking_notes
  FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS booking_notes_update ON public.booking_notes;
CREATE POLICY booking_notes_update ON public.booking_notes
  FOR UPDATE TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.clearance_level IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS booking_notes_delete ON public.booking_notes;
CREATE POLICY booking_notes_delete ON public.booking_notes
  FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.clearance_level IN ('admin', 'manager')
    )
  );

-- ---------------------------------------------------------------
-- 5. attachments storage bucket for general booking uploads.
--    payment-proofs bucket is preserved during the transition.
-- ---------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments',
  'attachments',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS attachments_select ON storage.objects;
CREATE POLICY attachments_select ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'attachments');

DROP POLICY IF EXISTS attachments_insert ON storage.objects;
CREATE POLICY attachments_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'attachments');

DROP POLICY IF EXISTS attachments_update ON storage.objects;
CREATE POLICY attachments_update ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'attachments');

DROP POLICY IF EXISTS attachments_delete ON storage.objects;
CREATE POLICY attachments_delete ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'attachments');

-- ---------------------------------------------------------------
-- 6. Backfill existing payment proofs into documents table.
--    Only runs if payments.proof_storage_path exists in this DB
--    (some envs use proof_url or have no proof column at all).
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND column_name = 'proof_storage_path'
  ) THEN
    EXECUTE $sql$
      INSERT INTO public.documents (
        id, booking_id, kind, status, storage_path, file_name, uploaded_by, payment_id, created_at
      )
      SELECT
        gen_random_uuid(),
        p.booking_id,
        'proof_of_payment'::public.document_kind,
        'received'::public.document_status,
        p.proof_storage_path,
        regexp_replace(p.proof_storage_path, '.*/', ''),
        NULL,
        p.id,
        now()
      FROM public.payments p
      WHERE p.proof_storage_path IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.documents d
          WHERE d.payment_id = p.id AND d.kind = 'proof_of_payment'
        )
    $sql$;
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 7. Settings keys for general attachment limits.
-- ---------------------------------------------------------------
INSERT INTO public.app_settings (key, value, updated_at) VALUES
  ('attachment_max_size_mb', '10', now()),
  (
    'attachment_allowed_mime_types',
    '["application/pdf","image/jpeg","image/png","image/webp","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]',
    now()
  )
ON CONFLICT (key) DO NOTHING;
