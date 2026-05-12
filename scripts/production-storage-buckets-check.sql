SELECT id, name, public, file_size_limit, allowed_mime_types::text AS allowed_mime_types
FROM storage.buckets
WHERE id IN ('voucher-assets', 'vouchers')
ORDER BY id;
