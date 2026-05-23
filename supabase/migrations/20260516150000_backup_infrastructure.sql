-- Backup infrastructure: private Supabase Storage bucket + record table.
-- Backups are created server-side only and never exposed via public URLs.

-- Private storage bucket for backup snapshots
INSERT INTO storage.buckets (id, name, public)
VALUES ('backups', 'backups', false)
ON CONFLICT (id) DO NOTHING;

-- Metadata table for backup snapshots
CREATE TABLE IF NOT EXISTS backup_records (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path   text NOT NULL,
  size_bytes     bigint,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES profiles(user_id) ON DELETE SET NULL,
  retained_until timestamptz
);

ALTER TABLE backup_records ENABLE ROW LEVEL SECURITY;

-- Admin and manager: read and create backups
DROP POLICY IF EXISTS "backup_records_admin_manager_select" ON backup_records;
CREATE POLICY "backup_records_admin_manager_select"
  ON backup_records
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.clearance_level IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "backup_records_admin_manager_insert" ON backup_records;
CREATE POLICY "backup_records_admin_manager_insert"
  ON backup_records
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.clearance_level IN ('admin', 'manager')
    )
  );

-- Storage policies for the backups bucket
DROP POLICY IF EXISTS "backups_bucket_admin_manager_select" ON storage.objects;
CREATE POLICY "backups_bucket_admin_manager_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'backups'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.clearance_level IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "backups_bucket_admin_manager_insert" ON storage.objects;
CREATE POLICY "backups_bucket_admin_manager_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'backups'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.clearance_level IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "backups_bucket_admin_manager_delete" ON storage.objects;
CREATE POLICY "backups_bucket_admin_manager_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'backups'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.clearance_level IN ('admin', 'manager')
    )
  );
