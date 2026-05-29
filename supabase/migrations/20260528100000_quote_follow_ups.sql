-- Phase 24: Quote Follow-Up Worker
-- Creates quote_follow_ups tracking table and adds follow_ups_disabled flag to quotes.

create table if not exists public.quote_follow_ups (
  id            uuid        primary key default gen_random_uuid(),
  quote_id      uuid        not null references public.quotes(id) on delete cascade,
  scheduled_for date        not null,
  sent_at       timestamptz,
  status        text        not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  skip_reason   text,
  error         text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_quote_follow_ups_quote_id on public.quote_follow_ups(quote_id);
create index if not exists idx_quote_follow_ups_status on public.quote_follow_ups(status);

alter table public.quote_follow_ups enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'quote_follow_ups'
      and policyname = 'quote_follow_ups_select_auth'
  ) then
    create policy "quote_follow_ups_select_auth"
      on public.quote_follow_ups for select
      using (auth.role() = 'authenticated');
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'quote_follow_ups'
      and policyname = 'quote_follow_ups_insert_service'
  ) then
    create policy "quote_follow_ups_insert_service"
      on public.quote_follow_ups for insert
      with check (auth.role() = 'service_role');
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'quote_follow_ups'
      and policyname = 'quote_follow_ups_update_service'
  ) then
    create policy "quote_follow_ups_update_service"
      on public.quote_follow_ups for update
      using (auth.role() = 'service_role');
  end if;
end $$;

-- Add follow_ups_disabled flag to quotes (per-quote override)
alter table public.quotes
  add column if not exists follow_ups_disabled boolean not null default false;
