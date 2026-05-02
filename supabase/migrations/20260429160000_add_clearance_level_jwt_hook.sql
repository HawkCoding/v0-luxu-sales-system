create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  claims         jsonb;
  app_meta       jsonb;
  user_clearance text;
begin
  select clearance_level::text into user_clearance
  from public.profiles
  where user_id = (event ->> 'user_id')::uuid;

  if user_clearance is null then
    user_clearance := 'consultant';
  end if;

  claims := event -> 'claims';
  app_meta := coalesce(claims -> 'app_metadata', '{}'::jsonb);
  app_meta := app_meta || jsonb_build_object('clearance_level', user_clearance);
  claims := jsonb_set(claims, '{app_metadata}', app_meta, true);

  return jsonb_set(event, '{claims}', claims, true);
exception when others then
  return event;
end;
$$;

revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

grant usage on schema public to supabase_auth_admin;
grant select on public.profiles to supabase_auth_admin;

drop policy if exists "Auth admin can read profiles for token hook" on public.profiles;
create policy "Auth admin can read profiles for token hook"
  on public.profiles for select to supabase_auth_admin using (true);
