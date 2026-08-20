-- Email test mode: redirect every outbound email to a controlled test inbox so
-- the full pipeline can be demoed against real data without any message ever
-- reaching a customer. Turning the switch off restores live sending.
--
-- Seeded disabled so applying this migration never changes sending behaviour.
INSERT INTO app_settings (key, value)
VALUES ('email_test_mode_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_settings (key, value)
VALUES ('email_test_mode_recipient', '')
ON CONFLICT (key) DO NOTHING;
