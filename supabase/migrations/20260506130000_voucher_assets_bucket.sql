-- Create the voucher-assets storage bucket for logo and banner images.
-- Public reads so images can be embedded directly in generated voucher HTML.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'voucher-assets',
  'voucher-assets',
  true,
  5242880, -- 5 MB per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "voucher_assets_read" ON storage.objects;
CREATE POLICY "voucher_assets_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'voucher-assets');

DROP POLICY IF EXISTS "voucher_assets_insert" ON storage.objects;
CREATE POLICY "voucher_assets_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'voucher-assets'
    AND public.auth_has_role(ARRAY['admin'::public.user_role])
  );

DROP POLICY IF EXISTS "voucher_assets_update" ON storage.objects;
CREATE POLICY "voucher_assets_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'voucher-assets'
    AND public.auth_has_role(ARRAY['admin'::public.user_role])
  );

DROP POLICY IF EXISTS "voucher_assets_delete" ON storage.objects;
CREATE POLICY "voucher_assets_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'voucher-assets'
    AND public.auth_has_role(ARRAY['admin'::public.user_role])
  );
