-- Email brand block position: emails have always rendered the SARAIL brand
-- block in the footer. This adds a per-email placement setting so admins can
-- move it to the top (below the logo header, above the body) or hide it, from
-- Settings > Brand block. Seed 'bottom' to preserve the existing footer layout;
-- missing rows fall back to the same default in lib/settings-access.ts.
INSERT INTO public.app_settings (key, value) VALUES
  ('brand_block_position_email', 'bottom')
ON CONFLICT (key) DO NOTHING;
