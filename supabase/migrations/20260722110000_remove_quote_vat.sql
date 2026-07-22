alter table public.quotes
  drop column if exists vat;

-- Old 5-arg signature must be dropped explicitly — `create or replace`
-- only replaces a function with an identical argument list, it will not
-- collapse a differing overload.
drop function if exists public.replace_quote_line_items(uuid, jsonb, numeric, numeric, numeric);

create or replace function public.replace_quote_line_items(
  p_quote_id uuid,
  p_line_items jsonb,
  p_subtotal numeric,
  p_total numeric
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (select 1 from public.quotes where id = p_quote_id) then
    raise exception 'Quote not found';
  end if;

  delete from public.quote_line_items
  where quote_id = p_quote_id;

  insert into public.quote_line_items (
    quote_id,
    description,
    supplier_description,
    qty,
    unit_price,
    total,
    sort_order,
    pricing_snapshot
  )
  select
    p_quote_id,
    item.description,
    item.supplier_description,
    item.qty,
    item.unit_price,
    item.total,
    item.sort_order,
    item.pricing_snapshot
  from jsonb_to_recordset(p_line_items) as item(
    description text,
    supplier_description text,
    qty integer,
    unit_price numeric,
    total numeric,
    sort_order integer,
    pricing_snapshot jsonb
  );

  update public.quotes
  set subtotal = p_subtotal,
      total = p_total
  where id = p_quote_id;
end;
$$;

grant execute on function public.replace_quote_line_items(uuid, jsonb, numeric, numeric) to authenticated;

notify pgrst, 'reload schema';
