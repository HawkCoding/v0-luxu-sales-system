-- §3 Per-supplier rate markdowns. Declares which non-default rate types apply
-- to a supplier and how much cheaper they are than the supplier's default rate.
-- discount_pct is the percentage off the default rate (e.g. 20 => price * 0.8).
-- The default rate itself is the implicit 0% baseline and is never stored here.

CREATE TABLE IF NOT EXISTS public.supplier_rate_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  rate_type_id uuid NOT NULL REFERENCES public.rate_types(id),
  discount_pct numeric(5,2) NOT NULL DEFAULT 0
    CHECK (discount_pct >= 0 AND discount_pct <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, rate_type_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_rate_adjustments_supplier
  ON public.supplier_rate_adjustments (supplier_id);

ALTER TABLE public.supplier_rate_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sra_select" ON public.supplier_rate_adjustments;
CREATE POLICY "sra_select" ON public.supplier_rate_adjustments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "sra_insert" ON public.supplier_rate_adjustments;
CREATE POLICY "sra_insert" ON public.supplier_rate_adjustments
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));

DROP POLICY IF EXISTS "sra_update" ON public.supplier_rate_adjustments;
CREATE POLICY "sra_update" ON public.supplier_rate_adjustments
  FOR UPDATE TO authenticated
  USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
  WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));

DROP POLICY IF EXISTS "sra_delete" ON public.supplier_rate_adjustments;
CREATE POLICY "sra_delete" ON public.supplier_rate_adjustments
  FOR DELETE TO authenticated
  USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));
