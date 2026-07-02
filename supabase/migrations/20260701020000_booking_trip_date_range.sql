alter table public.bookings
  add column if not exists trip_start_date date,
  add column if not exists trip_end_date date;

alter table public.bookings
  drop constraint if exists bookings_trip_date_range_order_check;
alter table public.bookings
  add constraint bookings_trip_date_range_order_check
  check (trip_start_date is null or trip_end_date is null or trip_end_date >= trip_start_date);

create index if not exists idx_bookings_trip_start_date
  on public.bookings (trip_start_date);

-- Backfill from the existing single-date field so already-applied packages keep a start date.
update public.bookings
set trip_start_date = package_travel_date
where trip_start_date is null and package_travel_date is not null;
