INSERT INTO app_settings (key, value)
VALUES ('session_timeout_minutes', '30')
ON CONFLICT (key) DO NOTHING;
