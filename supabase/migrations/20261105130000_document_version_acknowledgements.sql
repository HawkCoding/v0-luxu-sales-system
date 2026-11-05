-- "Leave as is": a salesperson looks at a sent document the booking has since moved on from and
-- decides the client does not need an updated one. The decision is stored against the fingerprint
-- of the booking AT THAT MOMENT, so the "Changed since sent" flag clears now but comes back if the
-- booking changes again.
--
-- A separate insert-only table rather than a column on document_versions, which is deliberately
-- never updated (an issued copy is a record, not a draft). Idempotent.

CREATE TABLE IF NOT EXISTS public.document_version_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_version_id uuid NOT NULL REFERENCES public.document_versions(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  -- The booking's content fingerprint when it was acknowledged (lib/documents/content-fingerprint.ts).
  fingerprint text NOT NULL,
  acknowledged_by uuid,
  acknowledged_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_version_acknowledgements_version
  ON public.document_version_acknowledgements (document_version_id, acknowledged_at DESC);

ALTER TABLE public.document_version_acknowledgements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'document_version_acknowledgements' AND policyname = 'biz_select'
  ) THEN
    CREATE POLICY biz_select ON public.document_version_acknowledgements FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'document_version_acknowledgements' AND policyname = 'biz_insert'
  ) THEN
    CREATE POLICY biz_insert ON public.document_version_acknowledgements FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT ON TABLE public.document_version_acknowledgements TO authenticated;
GRANT ALL ON TABLE public.document_version_acknowledgements TO service_role;

NOTIFY pgrst, 'reload schema';
