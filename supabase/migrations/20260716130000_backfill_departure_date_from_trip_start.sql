-- Backfill: vouchers/itineraries and pricing read bookings.departure_date directly, but it was
-- only ever set at enquiry intake and never recomputed when package legs changed, so existing
-- package bookings show a stale departure. Re-sync it to the leg-derived trip_start_date.
-- Idempotent: rows already in sync (or with no derived start) are skipped.
update public.bookings
set departure_date = trip_start_date
where package_id is not null
  and trip_start_date is not null
  and departure_date is distinct from trip_start_date;
