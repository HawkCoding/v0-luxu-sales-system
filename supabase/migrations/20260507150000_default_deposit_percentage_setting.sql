-- Adds configurable default deposit percentage to the existing key/value settings table.
-- Idempotent so it can be applied to local databases in any state.

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_settings TO authenticated;
GRANT ALL ON TABLE public.app_settings TO service_role;

DROP POLICY IF EXISTS app_settings_admin_insert ON public.app_settings;
DROP POLICY IF EXISTS app_settings_admin_update ON public.app_settings;
DROP POLICY IF EXISTS app_settings_admin_delete ON public.app_settings;

CREATE POLICY app_settings_admin_insert
  ON public.app_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.clearance_level IN ('admin', 'manager')
    )
  );

CREATE POLICY app_settings_admin_update
  ON public.app_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.clearance_level IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.clearance_level IN ('admin', 'manager')
    )
  );

CREATE POLICY app_settings_admin_delete
  ON public.app_settings FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.clearance_level IN ('admin', 'manager')
    )
  );

INSERT INTO public.app_settings (key, value)
VALUES ('default_deposit_percentage', '25')
ON CONFLICT (key) DO NOTHING;
