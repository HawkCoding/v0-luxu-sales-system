-- Per-salesperson outgoing email signature. SMTP/IMAP only transports a
-- message; nothing appends a signature server-side, so the fields the
-- signature block renders (name, title, phones, email, web) live here and
-- the company-wide chrome (banner, registration, hours, confidentiality)
-- lives in app_settings, mirroring the salesperson_credentials + document
-- brand block split.

CREATE TABLE IF NOT EXISTS email_signatures (
  profile_id  uuid PRIMARY KEY REFERENCES profiles(user_id) ON DELETE CASCADE,
  full_name   text,
  job_title   text,
  tel         text,
  cell        text,
  fax         text,
  email       text,
  website     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE email_signatures ENABLE ROW LEVEL SECURITY;

-- Admin and manager: full access
DROP POLICY IF EXISTS "email_signatures_admin_manager_all" ON email_signatures;
CREATE POLICY "email_signatures_admin_manager_all"
  ON email_signatures
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.clearance_level IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.clearance_level IN ('admin', 'manager')
    )
  );

-- Consultant: read own row only
DROP POLICY IF EXISTS "email_signatures_consultant_select_own" ON email_signatures;
CREATE POLICY "email_signatures_consultant_select_own"
  ON email_signatures
  FOR SELECT
  TO authenticated
  USING (
    profile_id IN (
      SELECT user_id FROM profiles WHERE profiles.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.clearance_level = 'consultant'
    )
  );
