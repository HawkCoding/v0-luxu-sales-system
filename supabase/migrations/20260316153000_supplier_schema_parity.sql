-- Align supplier schema objects across environments.
-- This migration is idempotent and safe to run on both dev and production.

alter table public.suppliers
  add column if not exists location text;

create index if not exists supplier_pricing_options_supplier_idx
  on public.supplier_pricing_options using btree (supplier_id);

create index if not exists supplier_seasonal_periods_supplier_idx
  on public.supplier_seasonal_periods using btree (supplier_id);

create index if not exists supplier_seasonal_prices_option_idx
  on public.supplier_seasonal_prices using btree (option_id);

create index if not exists supplier_seasonal_prices_period_idx
  on public.supplier_seasonal_prices using btree (period_id);

create or replace function public.set_supplier_status()
returns trigger
language plpgsql
as $function$
begin
  if tg_op = 'INSERT' then
    new.status := 'draft';
  elsif tg_op = 'UPDATE' then
    if new.active = false then
      new.status := 'draft';
    else
      new.status := 'active';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists tr_set_supplier_status on public.suppliers;

create trigger tr_set_supplier_status
before insert or update on public.suppliers
for each row execute function public.set_supplier_status();

notify pgrst, 'reload schema';
