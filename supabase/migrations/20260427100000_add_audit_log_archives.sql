CREATE TABLE IF NOT EXISTS public.audit_log_archives (
  id uuid PRIMARY KEY,
  actor text NOT NULL,
  actor_user_id uuid,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  before_json jsonb,
  after_json jsonb,
  meta_json jsonb,
  created_at timestamp with time zone NOT NULL,
  archived_at timestamp with time zone NOT NULL DEFAULT now(),
  archive_batch_id uuid NOT NULL DEFAULT gen_random_uuid()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_archives_created_at
  ON public.audit_log_archives USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_archives_entity
  ON public.audit_log_archives USING btree (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_archives_batch
  ON public.audit_log_archives USING btree (archive_batch_id);

ALTER TABLE public.audit_log_archives ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.audit_log_archives TO authenticated;
GRANT ALL ON TABLE public.audit_log_archives TO service_role;

DROP POLICY IF EXISTS audit_log_archives_select ON public.audit_log_archives;
CREATE POLICY audit_log_archives_select
  ON public.audit_log_archives
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.clearance_level IN ('admin', 'manager')
    )
  );

CREATE OR REPLACE FUNCTION public.archive_old_audit_logs(cutoff_date timestamp with time zone)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  archived_count integer;
  batch_id uuid := gen_random_uuid();
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.clearance_level IN ('admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'Only admin and manager users can archive audit logs';
  END IF;

  WITH moved_rows AS (
    DELETE FROM public.audit_logs
    WHERE created_at < cutoff_date
    RETURNING
      id,
      actor,
      actor_user_id,
      entity_type,
      entity_id,
      action,
      before_json,
      after_json,
      meta_json,
      created_at
  ),
  inserted_rows AS (
    INSERT INTO public.audit_log_archives (
      id,
      actor,
      actor_user_id,
      entity_type,
      entity_id,
      action,
      before_json,
      after_json,
      meta_json,
      created_at,
      archive_batch_id
    )
    SELECT
      id,
      actor,
      actor_user_id,
      entity_type,
      entity_id,
      action,
      before_json,
      after_json,
      meta_json,
      created_at,
      batch_id
    FROM moved_rows
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO archived_count FROM inserted_rows;

  INSERT INTO public.audit_logs (
    actor,
    entity_type,
    entity_id,
    action,
    meta_json
  )
  VALUES (
    'system',
    'AuditLog',
    batch_id::text,
    'audit_logs_archived',
    jsonb_build_object('cutoff_date', cutoff_date, 'archived_count', archived_count)
  );

  RETURN archived_count;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_old_audit_logs(timestamp with time zone) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_old_audit_logs(timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_old_audit_logs(timestamp with time zone) TO service_role;

SELECT public.archive_old_audit_logs(now() - interval '24 months');

DO $archive_schedule$
BEGIN
  IF to_regnamespace('cron') IS NOT NULL THEN
    BEGIN
      EXECUTE $$SELECT cron.unschedule('archive-old-audit-logs')$$;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    EXECUTE $schedule$
      SELECT cron.schedule(
        'archive-old-audit-logs',
        '0 2 1 * *',
        'SELECT public.archive_old_audit_logs(now() - interval ''24 months'');'
      )
    $schedule$;
  END IF;
END;
$archive_schedule$;
