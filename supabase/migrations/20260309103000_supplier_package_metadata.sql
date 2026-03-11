alter table public.packages
  add column if not exists duration_nights integer,
  add column if not exists single_supplement_pct numeric(5, 2) not null default 50,
  add column if not exists currency text not null default 'ZAR';

update public.packages
set
  duration_nights = case name
    when 'Cape Town Classic' then 3
    when 'Victoria Falls Explorer' then 4
    when 'Durban Coastal Escape' then 2
    when 'Namibia Desert Journey' then 11
    when 'East Africa Expedition' then 16
    else duration_nights
  end,
  single_supplement_pct = case name
    when 'Cape Town Classic' then 50
    when 'Victoria Falls Explorer' then 50
    when 'Durban Coastal Escape' then 50
    when 'Namibia Desert Journey' then 50
    when 'East Africa Expedition' then 50
    else single_supplement_pct
  end,
  currency = case name
    when 'East Africa Expedition' then 'USD'
    else currency
  end
where name in (
  'Cape Town Classic',
  'Victoria Falls Explorer',
  'Durban Coastal Escape',
  'Namibia Desert Journey',
  'East Africa Expedition'
);
