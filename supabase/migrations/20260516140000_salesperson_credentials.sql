-- Salesperson SMTP/IMAP outbound mail credentials.
-- Passwords are AES-256-GCM encrypted via EMAIL_CREDENTIAL_ENCRYPTION_KEY before storage.
-- The encrypted_password column is never returned to client code.

CREATE TABLE IF NOT EXISTS salesperson_credentials (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id        uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  email_address     text NOT NULL,
  smtp_host         text NOT NULL DEFAULT 'mail.sa-rail.co.za',
  smtp_port         integer NOT NULL DEFAULT 465,
  smtp_encryption   text NOT NULL DEFAULT 'ssl',
  imap_host         text NOT NULL DEFAULT 'mail.sa-rail.co.za',
  imap_port         integer NOT NULL DEFAULT 993,
  imap_encryption   text NOT NULL DEFAULT 'ssl',
  imap_sent_folder  text NOT NULL DEFAULT 'Sent',
  encrypted_password text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id)
);

ALTER TABLE salesperson_credentials ENABLE ROW LEVEL SECURITY;

-- Admin and manager: full access
DROP POLICY IF EXISTS "salesperson_credentials_admin_manager_all" ON salesperson_credentials;
CREATE POLICY "salesperson_credentials_admin_manager_all"
  ON salesperson_credentials
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
DROP POLICY IF EXISTS "salesperson_credentials_consultant_select_own" ON salesperson_credentials;
CREATE POLICY "salesperson_credentials_consultant_select_own"
  ON salesperson_credentials
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
