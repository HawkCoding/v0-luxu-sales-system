-- Allow managers to delete supplier reference rows during supplier edits.
-- Previously only admins could delete packages, routes, suite_types, and rate_cards,
-- which caused 500 errors when a manager tried to edit and remove child rows.

DO $$
BEGIN
  -- packages
  DROP POLICY IF EXISTS ref_delete ON public.packages;
  CREATE POLICY ref_delete ON public.packages
    FOR DELETE TO authenticated
    USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));

  -- routes
  DROP POLICY IF EXISTS ref_delete ON public.routes;
  CREATE POLICY ref_delete ON public.routes
    FOR DELETE TO authenticated
    USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));

  -- suite_types
  DROP POLICY IF EXISTS ref_delete ON public.suite_types;
  CREATE POLICY ref_delete ON public.suite_types
    FOR DELETE TO authenticated
    USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));

  -- rate_cards
  DROP POLICY IF EXISTS ref_delete ON public.rate_cards;
  CREATE POLICY ref_delete ON public.rate_cards
    FOR DELETE TO authenticated
    USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));

  -- supplier_pricing_options
  DROP POLICY IF EXISTS ref_delete ON public.supplier_pricing_options;
  CREATE POLICY ref_delete ON public.supplier_pricing_options
    FOR DELETE TO authenticated
    USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));

  -- supplier_seasonal_periods
  DROP POLICY IF EXISTS ref_delete ON public.supplier_seasonal_periods;
  CREATE POLICY ref_delete ON public.supplier_seasonal_periods
    FOR DELETE TO authenticated
    USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));

  -- supplier_seasonal_prices
  DROP POLICY IF EXISTS ref_delete ON public.supplier_seasonal_prices;
  CREATE POLICY ref_delete ON public.supplier_seasonal_prices
    FOR DELETE TO authenticated
    USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));
END;
$$;
