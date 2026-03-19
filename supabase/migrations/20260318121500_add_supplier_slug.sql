-- Add readable supplier slugs for URL routing.

alter table public.suppliers
  add column if not exists slug text;

with normalized_names as (
  select
    id,
    coalesce(nullif(trim(name), ''), 'supplier') as normalized_name
  from public.suppliers
),
slug_bases as (
  select
    id,
    trim(both '-' from regexp_replace(lower(normalized_name), '[^a-z0-9]+', '-', 'g')) as base_slug
  from normalized_names
),
ranked_slugs as (
  select
    id,
    coalesce(nullif(base_slug, ''), 'supplier') as base_slug,
    row_number() over (
      partition by coalesce(nullif(base_slug, ''), 'supplier')
      order by id
    ) as duplicate_rank
  from slug_bases
)
update public.suppliers as suppliers
set slug = case
  when ranked_slugs.duplicate_rank = 1 then ranked_slugs.base_slug
  else ranked_slugs.base_slug || '-' || ranked_slugs.duplicate_rank::text
end
from ranked_slugs
where suppliers.id = ranked_slugs.id;

alter table public.suppliers
  alter column slug set not null;

create unique index if not exists suppliers_slug_unique_idx
  on public.suppliers using btree (slug);

notify pgrst, 'reload schema';
