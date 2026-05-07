DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'package_legs' AND policyname = 'ref_select'
  ) THEN
    CREATE POLICY ref_select ON public.package_legs
      FOR SELECT TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'package_legs' AND policyname = 'ref_insert'
  ) THEN
    CREATE POLICY ref_insert ON public.package_legs
      FOR INSERT TO authenticated
      WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'package_legs' AND policyname = 'ref_update'
  ) THEN
    CREATE POLICY ref_update ON public.package_legs
      FOR UPDATE TO authenticated
      USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
      WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'package_legs' AND policyname = 'ref_delete'
  ) THEN
    CREATE POLICY ref_delete ON public.package_legs
      FOR DELETE TO authenticated
      USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));
  END IF;
END $$;
