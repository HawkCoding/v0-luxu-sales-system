-- Ensure supplier_kind enum supports the transfers option in all environments.

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'supplier_kind'
      and e.enumlabel = 'transfers'
  ) then
    alter type public.supplier_kind add value 'transfers';
  end if;
end $$;

notify pgrst, 'reload schema';
