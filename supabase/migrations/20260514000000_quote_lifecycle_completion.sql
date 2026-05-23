-- Quote lifecycle completion: add statuses, acceptance tokens

-- Ensure pgcrypto is available for gen_random_bytes
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1a. Extend quote_status enum with new terminal/lifecycle values
ALTER TYPE quote_status ADD VALUE IF NOT EXISTS 'expired';
ALTER TYPE quote_status ADD VALUE IF NOT EXISTS 'superseded';
ALTER TYPE quote_status ADD VALUE IF NOT EXISTS 'cancelled';

-- 1b. Index to efficiently find quotes nearing or past expiry
CREATE INDEX IF NOT EXISTS idx_quotes_validity_until
  ON quotes (validity_until)
  WHERE status IN ('draft', 'ready', 'sent');

-- 1c. Secure acceptance tokens for customer-facing quote acceptance links
CREATE TABLE IF NOT EXISTS quote_acceptance_tokens (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id       uuid        NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  token          text        NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  expires_at     timestamptz NOT NULL,
  used_at        timestamptz,
  used_by_ip     text,
  created_by     uuid        REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_acceptance_tokens_quote_id
  ON quote_acceptance_tokens (quote_id);

CREATE INDEX IF NOT EXISTS idx_quote_acceptance_tokens_token
  ON quote_acceptance_tokens (token);

-- RLS: only authenticated users (salesperson+) can create tokens;
-- public read is handled via service client in the accept-public route
ALTER TABLE quote_acceptance_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage acceptance tokens"
  ON quote_acceptance_tokens
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 1d. Private storage bucket for generated quote PDFs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('quotes', 'quotes', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "quotes_pdf_read" ON storage.objects;
CREATE POLICY "quotes_pdf_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'quotes');

DROP POLICY IF EXISTS "quotes_pdf_insert" ON storage.objects;
CREATE POLICY "quotes_pdf_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'quotes'
    AND public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role, 'consultant'::public.user_role])
  );

DROP POLICY IF EXISTS "quotes_pdf_update" ON storage.objects;
CREATE POLICY "quotes_pdf_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'quotes'
    AND public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role, 'consultant'::public.user_role])
  )
  WITH CHECK (
    bucket_id = 'quotes'
    AND public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role, 'consultant'::public.user_role])
  );
