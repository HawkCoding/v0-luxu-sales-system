-- Ensure supplier_kind enum supports tours and airlines in all environments.

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'supplier_kind'
      and e.enumlabel = 'tour_operator'
  ) then
    alter type public.supplier_kind add value 'tour_operator';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'supplier_kind'
      and e.enumlabel = 'airline'
  ) then
    alter type public.supplier_kind add value 'airline';
  end if;
end $$;

notify pgrst, 'reload schema';
