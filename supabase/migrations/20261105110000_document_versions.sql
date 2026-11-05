-- Issued document history: a fixed copy of every quote, invoice and voucher PDF that goes out.
--
-- Until now each of those PDFs was one storage object overwritten on every render, and the email
-- row kept no reference to the file it carried, so once a document was regenerated the copy a
-- client actually received could not be found again. This table keeps the exact bytes of each
-- distinct issued document in its own immutable bucket and links the email to it.
--
-- Purely additive: nothing reads these rows yet (the Documents tab picks them up in a later
-- phase), and a failed capture never blocks a send. Rows are insert-only by policy.
-- Idempotent: IF NOT EXISTS / DROP IF EXISTS throughout.

CREATE TABLE IF NOT EXISTS public.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  -- The record the document was issued from. SET NULL rather than CASCADE: the copy outlives a
  -- voided or replaced row, which is the point of keeping it.
  quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  voucher_id uuid REFERENCES public.vouchers(id) ON DELETE SET NULL,
  -- 1..N per booking and document type, in the order the distinct copies were issued.
  version_no integer NOT NULL,
  -- Path inside the document-versions bucket. Content-addressed (sha256), so identical bytes are
  -- stored once and a path can never be reused for different content.
  storage_path text NOT NULL,
  file_name text NOT NULL,
  sha256 text NOT NULL,
  size_bytes integer NOT NULL,
  -- 'sent' = attached to an email that went out; 'saved' = kept without sending (a later phase).
  issue_kind text NOT NULL DEFAULT 'sent',
  issued_at timestamp with time zone NOT NULL DEFAULT now(),
  issued_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT document_versions_doc_type_check CHECK (doc_type IN ('quote', 'invoice', 'voucher')),
  CONSTRAINT document_versions_issue_kind_check CHECK (issue_kind IN ('sent', 'saved')),
  CONSTRAINT document_versions_version_no_positive CHECK (version_no > 0),
  CONSTRAINT document_versions_booking_type_version_key UNIQUE (booking_id, doc_type, version_no)
);

-- One row per distinct content: re-sending the same bytes links to the existing version.
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_versions_booking_type_sha
  ON public.document_versions (booking_id, doc_type, sha256);

CREATE INDEX IF NOT EXISTS idx_document_versions_booking_issued
  ON public.document_versions (booking_id, issued_at DESC);

ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

-- Read and insert only. No UPDATE or DELETE policy: an issued copy is a record, not a draft.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'document_versions' AND policyname = 'biz_select'
  ) THEN
    CREATE POLICY biz_select ON public.document_versions FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'document_versions' AND policyname = 'biz_insert'
  ) THEN
    CREATE POLICY biz_insert ON public.document_versions FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT ON TABLE public.document_versions TO authenticated;
GRANT ALL ON TABLE public.document_versions TO service_role;

-- Which issued copy an email carried. Nullable: every email written before this, and every email
-- with no quote/invoice/voucher attachment, has none.
ALTER TABLE public.correspondences
  ADD COLUMN IF NOT EXISTS document_version_id uuid REFERENCES public.document_versions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_correspondences_document_version_id
  ON public.correspondences (document_version_id)
  WHERE document_version_id IS NOT NULL;

-- Private bucket for the copies. Read and insert policies only; with no update or delete policy
-- the session client cannot overwrite or remove an object once written.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('document-versions', 'document-versions', false, 15728640, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "document_versions_read" ON storage.objects;
CREATE POLICY "document_versions_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'document-versions');

DROP POLICY IF EXISTS "document_versions_insert" ON storage.objects;
CREATE POLICY "document_versions_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'document-versions'
    AND public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role, 'consultant'::public.user_role])
  );

NOTIFY pgrst, 'reload schema';
