-- Add proof_storage_path column to payments for optional payment proof file uploads.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS proof_storage_path text;

-- Create payment-proofs storage bucket for proof-of-payment files.
-- Allowed MIME types: JPEG, PNG, WebP, PDF (max 10 MB).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-proofs',
  'payment-proofs',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for payment-proofs bucket.
CREATE POLICY "payment_proofs_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'payment-proofs');

CREATE POLICY "payment_proofs_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-proofs');

CREATE POLICY "payment_proofs_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'payment-proofs');

CREATE POLICY "payment_proofs_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'payment-proofs');
