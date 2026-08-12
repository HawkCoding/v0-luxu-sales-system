-- Per-route departure/arrival times. Previously a single pair lived on the supplier
-- (suppliers.default_time_start/end), which forced every route of a train operator to share one
-- schedule. Each route now carries its own times.
--
-- A two-way route is a single row (A <-> B) and booking_services.route_reversed records which way a
-- given booking travels, so the return leg needs its own pair: the outbound 08:00 departure from
-- Pretoria says nothing about when the train leaves Cape Town.
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS departure_time time,
  ADD COLUMN IF NOT EXISTS arrival_time time,
  ADD COLUMN IF NOT EXISTS return_departure_time time,
  ADD COLUMN IF NOT EXISTS return_arrival_time time;

-- Backfill from the supplier so documents for existing bookings keep printing the same times.
-- Train operators only: a hotel's "route" is a meal plan and still reads its times off the supplier.
UPDATE public.routes r
SET
  departure_time = COALESCE(r.departure_time, s.default_time_start),
  arrival_time = COALESCE(r.arrival_time, s.default_time_end),
  return_departure_time = CASE
    WHEN r.direction_mode = 'round_trip' THEN COALESCE(r.return_departure_time, s.default_time_start)
    ELSE r.return_departure_time
  END,
  return_arrival_time = CASE
    WHEN r.direction_mode = 'round_trip' THEN COALESCE(r.return_arrival_time, s.default_time_end)
    ELSE r.return_arrival_time
  END
FROM public.suppliers s
WHERE s.id = r.supplier_id
  AND s.kind = 'train_operator'
  AND (s.default_time_start IS NOT NULL OR s.default_time_end IS NOT NULL);

-- Now that the routes carry the times, drop the operator-level pair: it is no longer editable for
-- trains and no longer read for them, so leaving it populated would be invisible dead state.
-- Hotels keep theirs (a hotel's "route" is a meal plan and has no schedule of its own).
UPDATE public.suppliers
SET default_time_start = NULL, default_time_end = NULL
WHERE kind = 'train_operator'
  AND (default_time_start IS NOT NULL OR default_time_end IS NOT NULL);

NOTIFY pgrst, 'reload schema';
