-- Per-suite/room unit config for train & hotel package legs: independent suite type +
-- bedroom type + bedroom layout + bathroom type + passenger split per unit within a leg.
create table if not exists public.booking_package_selection_units (
  id uuid primary key default gen_random_uuid(),
  selection_id uuid not null references public.booking_package_selections(id) on delete cascade,
  suite_type_id uuid references public.suite_types(id) on delete set null,
  bedroom_type_id uuid references public.bedroom_types(id) on delete set null,
  bedroom_layout_id uuid references public.bedroom_layouts(id) on delete set null,
  bathroom_type_id uuid references public.bathroom_types(id) on delete set null,
  adult_count integer not null default 0,
  child_count integer not null default 0,
  infant_count integer not null default 0,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_booking_package_selection_units_selection_id
  on public.booking_package_selection_units (selection_id);

alter table public.booking_package_selection_units enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'booking_package_selection_units' and policyname = 'biz_select'
  ) then
    create policy biz_select on public.booking_package_selection_units
      for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'booking_package_selection_units' and policyname = 'biz_insert'
  ) then
    create policy biz_insert on public.booking_package_selection_units
      for insert to authenticated with check (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'booking_package_selection_units' and policyname = 'biz_update'
  ) then
    create policy biz_update on public.booking_package_selection_units
      for update to authenticated using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'booking_package_selection_units' and policyname = 'biz_delete'
  ) then
    create policy biz_delete on public.booking_package_selection_units
      for delete to authenticated using (true);
  end if;
end $$;

drop trigger if exists set_booking_package_selection_units_updated_at on public.booking_package_selection_units;
create trigger set_booking_package_selection_units_updated_at
  before update on public.booking_package_selection_units
  for each row execute function public.set_updated_at();

grant all on table public.booking_package_selection_units to anon;
grant all on table public.booking_package_selection_units to authenticated;
grant all on table public.booking_package_selection_units to service_role;

-- A hotel stay's night count is leg-level (doesn't split per room).
alter table public.booking_package_selections
  add column if not exists nights integer;

-- Backfill: seed one unit per existing selection that already has a suite type,
-- so in-flight bookings survive the cutover from a leg-level suite_type_id to per-unit rows.
insert into public.booking_package_selection_units (selection_id, suite_type_id, sort_order)
select id, suite_type_id, 0
from public.booking_package_selections
where suite_type_id is not null
  and not exists (
    select 1 from public.booking_package_selection_units u
    where u.selection_id = booking_package_selections.id
  );

notify pgrst, 'reload schema';
