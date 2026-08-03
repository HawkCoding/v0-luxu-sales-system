-- brand_block_position_quote was seeded 'bottom' while the Settings UI's single
-- "PDF position" dropdown only ever displayed/edited brand_block_position_invoice
-- ('top'), so the two silently diverged and the quote PDF rendered the brand
-- block in the footer while Settings showed "Top". Bring the stored value in
-- line with what the UI has always displayed.
UPDATE public.app_settings
SET value = 'top', updated_at = now()
WHERE key = 'brand_block_position_quote' AND value = 'bottom';
