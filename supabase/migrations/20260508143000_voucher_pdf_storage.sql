-- Private bucket for generated voucher PDFs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('vouchers', 'vouchers', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "vouchers_read" ON storage.objects;
CREATE POLICY "vouchers_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'vouchers');

DROP POLICY IF EXISTS "vouchers_insert" ON storage.objects;
CREATE POLICY "vouchers_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'vouchers'
    AND public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role, 'consultant'::public.user_role])
  );

DROP POLICY IF EXISTS "vouchers_update" ON storage.objects;
CREATE POLICY "vouchers_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'vouchers'
    AND public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role, 'consultant'::public.user_role])
  )
  WITH CHECK (
    bucket_id = 'vouchers'
    AND public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role, 'consultant'::public.user_role])
  );
