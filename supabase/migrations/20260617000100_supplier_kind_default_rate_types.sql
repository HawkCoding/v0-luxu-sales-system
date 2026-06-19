-- §2 Per-supplier-kind default rate type. Replaces the single global default
-- for the purpose of deciding which rate a supplier (and its rate matrix)
-- starts on. Hotels default to Standard Tour Operator; everything else
-- defaults to Rack Rate. The global rate_types.is_default remains the ultimate
-- fallback when no row exists for a kind.

CREATE TABLE IF NOT EXISTS public.supplier_kind_default_rate_types (
  kind text PRIMARY KEY,
  rate_type_id uuid NOT NULL REFERENCES public.rate_types(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.supplier_kind_default_rate_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "skdrt_select" ON public.supplier_kind_default_rate_types;
CREATE POLICY "skdrt_select" ON public.supplier_kind_default_rate_types
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "skdrt_insert" ON public.supplier_kind_default_rate_types;
CREATE POLICY "skdrt_insert" ON public.supplier_kind_default_rate_types
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));

DROP POLICY IF EXISTS "skdrt_update" ON public.supplier_kind_default_rate_types;
CREATE POLICY "skdrt_update" ON public.supplier_kind_default_rate_types
  FOR UPDATE TO authenticated
  USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
  WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));

DROP POLICY IF EXISTS "skdrt_delete" ON public.supplier_kind_default_rate_types;
CREATE POLICY "skdrt_delete" ON public.supplier_kind_default_rate_types
  FOR DELETE TO authenticated
  USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));

-- Seed: hotels -> STO, all other supplier kinds -> RAC.
INSERT INTO public.supplier_kind_default_rate_types (kind, rate_type_id)
SELECT 'hotel_property', id FROM public.rate_types WHERE code = 'STO'
ON CONFLICT (kind) DO NOTHING;

INSERT INTO public.supplier_kind_default_rate_types (kind, rate_type_id)
SELECT k.kind, rt.id
  FROM (VALUES
    ('train_operator'),
    ('transfers'),
    ('vehicle_rental'),
    ('tour_operator'),
    ('airline')
  ) AS k(kind)
  CROSS JOIN public.rate_types rt
 WHERE rt.code = 'RAC'
ON CONFLICT (kind) DO NOTHING;
