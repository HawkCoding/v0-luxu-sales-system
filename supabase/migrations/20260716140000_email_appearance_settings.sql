-- Global font family + size for all outgoing emails. Edited from Templates >
-- Email Templates. Values are validated against the allowlists in
-- lib/settings-access.ts on read; anything unrecognised falls back to the code
-- default, so this seed only pre-populates the editor with current behaviour.
INSERT INTO public.app_settings (key, value) VALUES
  ('email_font_family', 'Arial, sans-serif'),
  ('email_font_size', '16px')
ON CONFLICT (key) DO NOTHING;
