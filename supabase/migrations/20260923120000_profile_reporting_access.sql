-- Reporting page access is a per-user permission set by an admin in
-- Settings -> Users. Default OFF for everyone, admins included: nobody sees
-- /app/reporting or /api/reports/* until an admin switches it on.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_view_reporting boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.can_view_reporting IS
  'Per-user grant for the Reporting page and /api/reports/*. Set only by an admin via /api/users (service role); users cannot change their own.';

-- Column protection.
--
-- A column-level REVOKE would do nothing here: 20260308095136_remote_schema.sql
-- grants ALL on public.profiles to anon and authenticated at table level, and
-- a table-level UPDATE grant covers every column regardless of column REVOKEs.
-- The profiles_update_own RLS policy lets any authenticated user UPDATE their
-- own row (and profiles_insert_own lets them INSERT it), so without a guard a
-- consultant could PATCH their own profile through PostgREST and grant
-- themselves reporting.
--
-- The guard is a trigger that rejects any change to the column made while the
-- database role is one of the PostgREST end-user roles (authenticated / anon).
-- The admin-only /api/users routes write with the service-role client, whose
-- current_user is service_role, so they pass. Migrations, seeds and
-- SECURITY DEFINER functions run as postgres and also pass. The function is
-- deliberately SECURITY INVOKER so current_user reflects the caller.
CREATE OR REPLACE FUNCTION public.guard_profiles_can_view_reporting()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.can_view_reporting THEN
      RAISE EXCEPTION 'Reporting access can only be granted by an administrator'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.can_view_reporting IS DISTINCT FROM OLD.can_view_reporting THEN
    RAISE EXCEPTION 'Reporting access can only be changed by an administrator'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_profiles_can_view_reporting() IS
  'Blocks authenticated/anon roles from setting profiles.can_view_reporting; only service_role (the admin users API) may change it.';

DROP TRIGGER IF EXISTS trg_guard_profiles_can_view_reporting ON public.profiles;
CREATE TRIGGER trg_guard_profiles_can_view_reporting
  BEFORE INSERT OR UPDATE OF can_view_reporting ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_can_view_reporting();
