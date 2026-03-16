-- Move suite_types from package-level to supplier-level.
-- Step 1: add supplier_id as nullable and backfill from packages.
alter table public.suite_types
  add column if not exists supplier_id uuid;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'suite_types'
      and column_name = 'package_id'
  ) then
    update public.suite_types
      set supplier_id = p.supplier_id
      from public.packages p
      where suite_types.package_id = p.id
        and suite_types.supplier_id is null;
  end if;
end
$$;

-- Rows seeded without a package_id: assign to the first train_operator supplier.
update public.suite_types
  set supplier_id = (
    select id from public.suppliers
    where kind = 'train_operator'
    order by created_at
    limit 1
  )
  where supplier_id is null;

-- Step 2: make the column NOT NULL now that all rows are populated.
alter table public.suite_types
  alter column supplier_id set not null;

-- Step 3: drop the old package-level constraints and column.
alter table public.suite_types
  drop constraint if exists suite_types_package_id_fkey;

drop index if exists public.idx_suite_types_package_id;
alter table public.suite_types
  drop constraint if exists ux_suite_types_name_package;

alter table public.suite_types
  drop column if exists package_id;

-- Step 4: add the new supplier-level FK and indexes.
alter table public.suite_types
  add constraint suite_types_supplier_id_fkey
  foreign key (supplier_id)
  references public.suppliers(id);

create unique index if not exists ux_suite_types_name_supplier
  on public.suite_types using btree (name, supplier_id);

create index if not exists idx_suite_types_supplier_id
  on public.suite_types using btree (supplier_id);
