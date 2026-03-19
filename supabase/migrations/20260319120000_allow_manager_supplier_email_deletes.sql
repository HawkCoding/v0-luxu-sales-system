-- Allow managers to delete supplier_emails rows during supplier edits.
-- supplier_emails was added after 20260319100000_allow_manager_ref_deletes.sql
-- and only had admin on ref_delete; managers hit RLS when removing emails.

DROP POLICY IF EXISTS ref_delete ON public.supplier_emails;
CREATE POLICY ref_delete ON public.supplier_emails
  FOR DELETE TO authenticated
  USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));
