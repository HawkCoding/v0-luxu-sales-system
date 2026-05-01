CREATE TABLE IF NOT EXISTS app_settings (
  key   text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read settings
CREATE POLICY "authenticated users can read app_settings"
  ON app_settings FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can write settings
CREATE POLICY "admins can update app_settings"
  ON app_settings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.clearance_level = 'admin'
    )
  );

-- Seed default value
INSERT INTO app_settings (key, value)
VALUES ('business_name', 'Luxus Travel and Tours')
ON CONFLICT (key) DO NOTHING;
