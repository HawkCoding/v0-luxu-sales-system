-- Ensure supplier_kind enum supports cruise lines in all environments.
-- Mirrors 20260327000000_add_supplier_kind_tours_airline.sql. A cruise line prices per person by
-- cabin type with no route of its own (like a tour operator), so it is the second type-priced
-- kind rather than a journey-shaped one -- see isTypePricedSupplier in lib/types.ts.

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'supplier_kind'
      and e.enumlabel = 'cruise_line'
  ) then
    alter type public.supplier_kind add value 'cruise_line';
  end if;
end $$;

notify pgrst, 'reload schema';
