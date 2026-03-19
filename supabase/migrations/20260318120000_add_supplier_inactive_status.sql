alter table public.suppliers
  drop constraint if exists suppliers_status_check;

alter table public.suppliers
  add constraint suppliers_status_check
  check (status in ('draft', 'active', 'inactive'));

create or replace function public.set_supplier_status()
returns trigger
language plpgsql
as $function$
begin
  if tg_op = 'INSERT' then
    new.status := 'draft';
  elsif new.active = true then
    new.status := 'active';
  elsif old.status = 'active' then
    new.status := 'inactive';
  else
    new.status := coalesce(old.status, 'draft');
  end if;
  return new;
end;
$function$;

drop trigger if exists tr_set_supplier_status on public.suppliers;

create trigger tr_set_supplier_status
before insert or update on public.suppliers
for each row execute function public.set_supplier_status();

notify pgrst, 'reload schema';
