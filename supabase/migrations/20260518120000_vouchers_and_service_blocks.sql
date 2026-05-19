-- Voucher lifecycle: booking <-> package linkage with per-leg selections,
-- the vouchers entity, and modular voucher_service_blocks per supplier.

-- 1. Booking <-> package linkage
alter table public.bookings
  add column if not exists package_id uuid references public.packages(id) on delete set null;

alter table public.bookings
  add column if not exists package_travel_date date;

create index if not exists idx_bookings_package_id
  on public.bookings (package_id);

-- 2. Per-booking selections derived from package legs
create table if not exists public.booking_package_selections (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  package_leg_id uuid not null references public.package_legs(id) on delete cascade,
  selected boolean not null default true,
  supplier_id uuid references public.suppliers(id) on delete set null,
  route_id uuid references public.routes(id) on delete set null,
  suite_type_id uuid references public.suite_types(id) on delete set null,
  service_date date,
  notes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create unique index if not exists ux_booking_package_selections_booking_leg
  on public.booking_package_selections (booking_id, package_leg_id);

create index if not exists idx_booking_package_selections_booking_id
  on public.booking_package_selections (booking_id);

alter table public.booking_package_selections enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'booking_package_selections' and policyname = 'biz_select'
  ) then
    create policy biz_select on public.booking_package_selections
      for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'booking_package_selections' and policyname = 'biz_insert'
  ) then
    create policy biz_insert on public.booking_package_selections
      for insert to authenticated with check (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'booking_package_selections' and policyname = 'biz_update'
  ) then
    create policy biz_update on public.booking_package_selections
      for update to authenticated using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'booking_package_selections' and policyname = 'biz_delete'
  ) then
    create policy biz_delete on public.booking_package_selections
      for delete to authenticated using (true);
  end if;
end $$;

drop trigger if exists set_booking_package_selections_updated_at on public.booking_package_selections;
create trigger set_booking_package_selections_updated_at
  before update on public.booking_package_selections
  for each row execute function public.set_updated_at();

grant all on table public.booking_package_selections to anon;
grant all on table public.booking_package_selections to authenticated;
grant all on table public.booking_package_selections to service_role;

-- 3. Vouchers entity
create table if not exists public.vouchers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  voucher_number text not null,
  pdf_document_id uuid references public.documents(id) on delete set null,
  generated_at timestamp with time zone,
  sent_at timestamp with time zone,
  created_by uuid not null references auth.users(id),
  created_at timestamp with time zone not null default now()
);

create unique index if not exists ux_vouchers_booking_id
  on public.vouchers (booking_id);

create index if not exists idx_vouchers_booking_id
  on public.vouchers (booking_id);

alter table public.vouchers enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'vouchers' and policyname = 'biz_select'
  ) then
    create policy biz_select on public.vouchers
      for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'vouchers' and policyname = 'biz_insert'
  ) then
    create policy biz_insert on public.vouchers
      for insert to authenticated with check (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'vouchers' and policyname = 'biz_update'
  ) then
    create policy biz_update on public.vouchers
      for update to authenticated using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'vouchers' and policyname = 'biz_delete'
  ) then
    create policy biz_delete on public.vouchers
      for delete to authenticated using (true);
  end if;
end $$;

grant all on table public.vouchers to anon;
grant all on table public.vouchers to authenticated;
grant all on table public.vouchers to service_role;

-- 4. Modular voucher service blocks
create table if not exists public.voucher_service_blocks (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.vouchers(id) on delete cascade,
  service_type text not null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  title text not null,
  supplier_reference text,
  contact_details jsonb not null default '{}'::jsonb,
  service_data jsonb not null default '{}'::jsonb,
  display_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  constraint voucher_service_blocks_service_type_check
    check (service_type in ('train','hotel','transfer','tour','airline','additional_service'))
);

create index if not exists idx_voucher_service_blocks_voucher_order
  on public.voucher_service_blocks (voucher_id, display_order);

alter table public.voucher_service_blocks enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'voucher_service_blocks' and policyname = 'biz_select'
  ) then
    create policy biz_select on public.voucher_service_blocks
      for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'voucher_service_blocks' and policyname = 'biz_insert'
  ) then
    create policy biz_insert on public.voucher_service_blocks
      for insert to authenticated with check (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'voucher_service_blocks' and policyname = 'biz_update'
  ) then
    create policy biz_update on public.voucher_service_blocks
      for update to authenticated using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'voucher_service_blocks' and policyname = 'biz_delete'
  ) then
    create policy biz_delete on public.voucher_service_blocks
      for delete to authenticated using (true);
  end if;
end $$;

grant all on table public.voucher_service_blocks to anon;
grant all on table public.voucher_service_blocks to authenticated;
grant all on table public.voucher_service_blocks to service_role;

notify pgrst, 'reload schema';
