-- SARAIL brand block settings: the seal + heading + subheading shown on the
-- quote/invoice/voucher/itinerary PDFs and the email footer. Position is chosen
-- per document type from Templates > Documents. Empty/missing rows fall back to
-- the code defaults in lib/settings-access.ts, so this seed only pre-populates
-- the editor with the current wording and each document's existing placement.
--
-- The logo URL is intentionally seeded empty: an empty value means "no uploaded
-- logo", and the renderers then fall back to the committed asset
-- (assets/brand/sarail-footer-logo.png).
INSERT INTO public.app_settings (key, value) VALUES
  ('brand_block_heading', 'A division of Luxus Travel & Tours'),
  ('brand_block_subheading', 'BLUE TRAIN | ROVOS RAIL | KRUGER SHALATI'),
  ('brand_block_logo_url', ''),
  ('brand_block_position_quote', 'bottom'),
  ('brand_block_position_invoice', 'top')
ON CONFLICT (key) DO NOTHING;
