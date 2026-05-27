-- Phase 25: Error Logging
-- Creates the error_logs table for structured server-side error tracking.
-- Inserts are service-role only; reads are open to all authenticated staff;
-- resolves (updates) are restricted to manager/admin at both API and RLS layers.

create table if not exists public.error_logs (
  id          uuid        primary key default gen_random_uuid(),
  severity    text        not null check (severity in ('Critical', 'Warning', 'Info')),
  source      text        not null,
  message     text        not null,
  details     jsonb,
  resolved    boolean     not null default false,
  resolved_by uuid        references auth.users(id),
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.error_logs enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'error_logs'
      and policyname = 'error_logs_select_auth'
  ) then
    create policy "error_logs_select_auth"
      on public.error_logs for select
      using (auth.role() = 'authenticated');
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'error_logs'
      and policyname = 'error_logs_insert_service'
  ) then
    create policy "error_logs_insert_service"
      on public.error_logs for insert
      with check (auth.role() = 'service_role');
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'error_logs'
      and policyname = 'error_logs_update_manager'
  ) then
    create policy "error_logs_update_manager"
      on public.error_logs for update
      using (
        exists (
          select 1 from public.profiles p
          where p.user_id = auth.uid()
            and p.clearance_level in ('admin', 'manager')
        )
      );
  end if;
end $$;
