CREATE TABLE IF NOT EXISTS public.package_leg_routes (
  package_leg_id uuid NOT NULL REFERENCES public.package_legs(id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (package_leg_id, route_id)
);

ALTER TABLE public.package_leg_routes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_package_leg_routes_route_id
  ON public.package_leg_routes (route_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'package_leg_routes'
      AND policyname = 'ref_select'
  ) THEN
    CREATE POLICY ref_select ON public.package_leg_routes
      FOR SELECT TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'package_leg_routes'
      AND policyname = 'ref_insert'
  ) THEN
    CREATE POLICY ref_insert ON public.package_leg_routes
      FOR INSERT TO authenticated
      WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'package_leg_routes'
      AND policyname = 'ref_update'
  ) THEN
    CREATE POLICY ref_update ON public.package_leg_routes
      FOR UPDATE TO authenticated
      USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
      WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'package_leg_routes'
      AND policyname = 'ref_delete'
  ) THEN
    CREATE POLICY ref_delete ON public.package_leg_routes
      FOR DELETE TO authenticated
      USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));
  END IF;
END $$;

INSERT INTO public.package_leg_routes (package_leg_id, route_id)
SELECT pl.id, r.id
FROM public.package_legs AS pl
JOIN public.suppliers AS s ON s.id = pl.supplier_id
JOIN public.routes AS r ON r.supplier_id = pl.supplier_id
WHERE s.kind <> 'hotel_property'
ON CONFLICT DO NOTHING;
