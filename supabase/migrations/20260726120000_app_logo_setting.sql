-- Admin-uploadable app logo (sidebar, favicon, login screen). Empty string
-- means "no logo uploaded" — consumers fall back to company-name text.
-- RLS on app_settings already covers this key: authenticated read, admin write.
INSERT INTO app_settings (key, value)
VALUES ('app_logo_url', '')
ON CONFLICT (key) DO NOTHING;
