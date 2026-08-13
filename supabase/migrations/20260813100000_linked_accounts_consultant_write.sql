-- Consultants may edit the customer record (edit:customers) and the linked-account
-- form is shown to them, but the RLS policies on customer_linked_accounts were left
-- at admin+manager when the API route gate was widened. The route therefore accepted
-- the request and PostgREST refused the insert, surfacing as a 500 rather than a
-- clean 403. Align the policies with the route's allowedRoles.

DROP POLICY IF EXISTS cla_insert ON public.customer_linked_accounts;
DROP POLICY IF EXISTS cla_update ON public.customer_linked_accounts;
DROP POLICY IF EXISTS cla_delete ON public.customer_linked_accounts;

CREATE POLICY cla_insert ON public.customer_linked_accounts
  FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_has_role(
      ARRAY['admin'::public.user_role, 'manager'::public.user_role, 'consultant'::public.user_role]
    )
  );

CREATE POLICY cla_update ON public.customer_linked_accounts
  FOR UPDATE TO authenticated
  USING (
    public.auth_has_role(
      ARRAY['admin'::public.user_role, 'manager'::public.user_role, 'consultant'::public.user_role]
    )
  )
  WITH CHECK (
    public.auth_has_role(
      ARRAY['admin'::public.user_role, 'manager'::public.user_role, 'consultant'::public.user_role]
    )
  );

CREATE POLICY cla_delete ON public.customer_linked_accounts
  FOR DELETE TO authenticated
  USING (
    public.auth_has_role(
      ARRAY['admin'::public.user_role, 'manager'::public.user_role, 'consultant'::public.user_role]
    )
  );

NOTIFY pgrst, 'reload schema';
