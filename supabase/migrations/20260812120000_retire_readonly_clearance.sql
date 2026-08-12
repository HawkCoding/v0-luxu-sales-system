-- Retire the `readonly` clearance level: the lowest role in the business is
-- always `consultant`, so `readonly` was dead surface that every role matrix,
-- permission table and QA prompt had to keep covering.
--
-- Postgres cannot drop a value from an enum type, so the `readonly` label stays
-- on public.user_role deliberately — it is unreachable once the app stops
-- offering it, and rebuilding the type would mean dropping the column default
-- and every dependent RLS function for no user-visible gain.
--
-- Idempotent: safe to re-run, no-ops once no profile carries the value.

UPDATE public.profiles
SET clearance_level = 'consultant'::public.user_role,
    updated_at = NOW()
WHERE clearance_level = 'readonly'::public.user_role;
