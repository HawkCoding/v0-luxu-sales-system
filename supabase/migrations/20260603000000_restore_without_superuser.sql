-- Make full backup restore work on Supabase WITHOUT superuser privileges.
--
-- The previous restore function (20260528110000) disabled FK triggers with
--   SET LOCAL session_replication_role = replica
-- which requires a superuser. On Supabase the executing role (service_role via
-- the SECURITY DEFINER owner) is NOT a superuser, so every restore aborted with
--   "permission denied to set parameter session_replication_role".
--
-- Fix: make every foreign key in the public schema DEFERRABLE, and have the
-- restore function defer all constraint checks to COMMIT with
--   SET CONSTRAINTS ALL DEFERRED
-- This needs no special privilege and correctly handles arbitrary insert order,
-- self-referential FKs (quotes.parent_quote_id, locations.parent_location_id) and
-- any FK cycles, because constraints are only validated once at COMMIT.
--
-- CONVENTION: new foreign keys should be declared `DEFERRABLE INITIALLY IMMEDIATE`
-- so restore keeps working. INITIALLY IMMEDIATE means there is no behavioural
-- change in normal operation — FKs are still checked at statement end; only a
-- transaction that opts in via SET CONSTRAINTS ALL DEFERRED defers them.

-- 1. Retrofit existing public-schema foreign keys to be deferrable (idempotent:
--    only touches constraints that are not already deferrable).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT con.conname AS conname, con.conrelid::regclass AS tbl
    FROM pg_constraint con
    JOIN pg_namespace nsp ON nsp.oid = con.connamespace
    WHERE con.contype = 'f'
      AND nsp.nspname = 'public'
      AND NOT con.condeferrable
  LOOP
    EXECUTE format(
      'ALTER TABLE %s ALTER CONSTRAINT %I DEFERRABLE INITIALLY IMMEDIATE',
      r.tbl, r.conname
    );
  END LOOP;
END;
$$;

-- 2. Recreate the restore function to defer constraints instead of disabling
--    FK triggers. SECURITY DEFINER still runs as the function owner; the implicit
--    function transaction keeps the restore all-or-nothing (rolls back on any error,
--    including a deferred FK violation surfaced at COMMIT).
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
  col_list     text;
BEGIN
  -- Defer all (now-deferrable) FK checks to COMMIT so tables can be truncated
  -- and reinserted in any order without intermediate FK violations.
  SET CONSTRAINTS ALL DEFERRED;

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

  -- Reinsert rows for each table using the snapshot data. Order is irrelevant
  -- now that FK checks are deferred to COMMIT.
  -- jsonb_populate_recordset maps JSON keys to column names by type lookup,
  -- handling enums, timestamps, uuids, and jsonb natively. We insert an explicit
  -- column list that EXCLUDES generated columns (e.g. invoices.outstanding_amount,
  -- GENERATED ALWAYS AS ... STORED) — Postgres rejects explicit values for those.
  FOR tbl IN
    SELECT j.key FROM jsonb_each(snapshot) AS j WHERE j.key <> '_meta'
  LOOP
    CONTINUE WHEN jsonb_array_length(snapshot->tbl) = 0;

    SELECT string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum)
      INTO col_list
      FROM pg_attribute a
      WHERE a.attrelid = format('public.%I', tbl)::regclass
        AND a.attnum > 0
        AND NOT a.attisdropped
        AND a.attgenerated = '';

    EXECUTE format(
      'INSERT INTO %I (%s) SELECT %s FROM jsonb_populate_recordset(null::%I, $1)',
      tbl, col_list, col_list, tbl
    ) USING (snapshot->tbl);
  END LOOP;
END;
$$;

-- Allow the service_role (used by the API restore route) to invoke this function.
GRANT EXECUTE ON FUNCTION public.restore_backup_snapshot(jsonb) TO service_role;
