-- SVG voucher assets render at intrinsic viewBox size in react-pdf and can
-- swallow the whole first page. SVG uploads are now blocked; clear any
-- existing SVG logo/banner so the PDF falls back to the text-only header.
UPDATE voucher_template
SET logo_url   = CASE WHEN logo_url   ~* '\.svg(\?|$)' THEN NULL ELSE logo_url END,
    banner_url = CASE WHEN banner_url ~* '\.svg(\?|$)' THEN NULL ELSE banner_url END,
    updated_at = now()
WHERE logo_url ~* '\.svg(\?|$)' OR banner_url ~* '\.svg(\?|$)';
