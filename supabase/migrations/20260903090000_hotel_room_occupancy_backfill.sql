-- Hotel rates are per adult per night, so a room's price now depends on who is in it.
--
-- Hotel legs never captured occupancy: `hotel_property` was not among the supplier kinds whose
-- units show Adults/Children/Infants inputs, so every existing hotel room carries 0/0/0. Left
-- alone those rooms would price at zero on their next quote build.
--
-- This spreads each booking's travellers evenly across its hotel rooms, matching the "Spread
-- evenly" action in the builder, so a saved booking reopens with a sensible split rather than an
-- empty one. It is a starting point, not an authority: the pricing engine refuses to price a stay
-- whose room split does not reconcile against the booking's traveller totals, so anything this gets
-- wrong is reported to the consultant rather than billed.
--
-- Idempotent: only rooms still sitting at zero occupancy are touched, so a re-run is a no-op and a
-- consultant's corrections are never overwritten.

with hotel_units as (
  select
    u.id            as unit_id,
    s.booking_id,
    row_number() over (partition by s.booking_id order by s.sort_order, u.sort_order, u.id) - 1 as unit_index,
    count(*)        over (partition by s.booking_id) as unit_count
  from public.booking_service_units u
  join public.booking_services s on s.id = u.service_id
  join public.suppliers sup      on sup.id = s.supplier_id
  where sup.kind = 'hotel_property'
    and coalesce(u.adult_count, 0) = 0
    and coalesce(u.child_count, 0) = 0
    and coalesce(u.infant_count, 0) = 0
),
-- Integer division plus one extra to the first `remainder` rooms, so the split always sums back to
-- the booking's totals exactly -- an even spread that loses a traveller to rounding would trip the
-- very reconciliation check this backfill exists to satisfy.
spread as (
  select
    hu.unit_id,
    (coalesce(b.no_of_adults, 0) / hu.unit_count)
      + case when hu.unit_index < (coalesce(b.no_of_adults, 0) % hu.unit_count) then 1 else 0 end as adult_count,
    (coalesce(b.no_of_children, 0) / hu.unit_count)
      + case when hu.unit_index < (coalesce(b.no_of_children, 0) % hu.unit_count) then 1 else 0 end as child_count
  from hotel_units hu
  join public.bookings b on b.id = hu.booking_id
)
-- Infants are not a column on bookings: a traveller counts as an infant only once the supplier's own
-- age bands are applied to the child ages, which is a per-supplier decision this migration has no
-- business making. Children are therefore spread as children, and any stay whose supplier bands
-- would reclassify one as an infant is surfaced by the reconciliation check on the next build.
update public.booking_service_units u
set
  adult_count = spread.adult_count,
  child_count = spread.child_count
from spread
where spread.unit_id = u.id;
