-- Full backup restore function.
-- SECURITY DEFINER runs as the function owner (postgres superuser), granting
-- permission to set session_replication_role = replica, which disables FK
-- constraint triggers so all tables can be truncated and reinserted in any order
-- without FK violations. The implicit function transaction makes this all-or-nothing.
--
-- Security note: salesperson_credentials contains AES-encrypted SMTP passwords.
-- These are acceptable in the private, server-only 'backups' bucket because:
--   1. The bucket is not publicly accessible.
--   2. Only Admin/Manager roles can create or restore backups.
--   3. The encrypted values are useless without the server-side encryption key.

DROP FUNCTION IF EXISTS public.restore_backup_snapshot(jsonb);

CREATE OR REPLACE FUNCTION public.restore_backup_snapshot(snapshot jsonb)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  tbl          text;
  first_tbl    boolean := true;
  truncate_sql text    := '';
BEGIN
  -- Disable FK constraint triggers for this transaction so inserts and
  -- truncates can proceed in any order without FK violations.
  SET LOCAL session_replication_role = replica;

  -- Build a single TRUNCATE statement for all snapshot tables.
  -- A single statement avoids the need to handle cross-table CASCADE ordering.
  FOR tbl IN
    SELECT j.key FROM jsonb_each(snapshot) AS j WHERE j.key <> '_meta'
  LOOP
    IF NOT first_tbl THEN
      truncate_sql := truncate_sql || ', ';
    END IF;
    truncate_sql := truncate_sql || format('%I', tbl);
    first_tbl := false;
  END LOOP;

  IF truncate_sql <> '' THEN
    -- RESTART IDENTITY resets auto-increment sequences; CASCADE drops orphaned rows
    -- in any tables that reference our list but are not themselves in the snapshot.
    EXECUTE 'TRUNCATE TABLE ' || truncate_sql || ' RESTART IDENTITY CASCADE';
  END IF;

  -- Reinsert rows for each table using the snapshot data.
  -- jsonb_populate_recordset maps JSON keys to column names by type lookup,
  -- handling enums, timestamps, uuids, and jsonb natively.
  FOR tbl IN
    SELECT j.key FROM jsonb_each(snapshot) AS j WHERE j.key <> '_meta'
  LOOP
    CONTINUE WHEN jsonb_array_length(snapshot->tbl) = 0;
    EXECUTE format(
      'INSERT INTO %I SELECT * FROM jsonb_populate_recordset(null::%I, $1)',
      tbl, tbl
    ) USING (snapshot->tbl);
  END LOOP;
END;
$$;

-- Allow the service_role (used by the API restore route) to invoke this function.
GRANT EXECUTE ON FUNCTION public.restore_backup_snapshot(jsonb) TO service_role;
