-- Voucher branding now comes entirely from the shared brand block (see
-- 20260717160000_document_brand_block.sql), not from its own logo/banner upload —
-- drop the columns the renderer no longer reads.
ALTER TABLE voucher_template DROP COLUMN IF EXISTS logo_url;
ALTER TABLE voucher_template DROP COLUMN IF EXISTS banner_url;

-- The font picker now offers real embedded font families (see lib/pdf/document-fonts.ts)
-- instead of a list that silently collapsed to two typefaces. Move the default to Arial,
-- matching the email appearance default (lib/email/appearance.ts).
ALTER TABLE voucher_template ALTER COLUMN font_family SET DEFAULT 'Arial, sans-serif';

UPDATE voucher_template
SET font_family = 'Arial, sans-serif'
WHERE font_family = 'Georgia, serif';
