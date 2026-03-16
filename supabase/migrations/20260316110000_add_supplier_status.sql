alter table public.suppliers
  add column if not exists status text not null default 'active';

alter table public.suppliers
  drop constraint if exists suppliers_status_check;

alter table public.suppliers
  add constraint suppliers_status_check
  check (status in ('draft', 'active'));

create index if not exists idx_suppliers_status
  on public.suppliers using btree (status);

NOTIFY pgrst, 'reload schema';
