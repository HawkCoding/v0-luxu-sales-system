-- Per-booking travel direction for two-way (round_trip) routes. A two-way route is a single row
-- (A ↔ B); this flag records which way a given booking actually travels so documents render the
-- booked direction (A → B or B → A). Pricing is direction-agnostic, so no rate-card changes.
ALTER TABLE public.booking_package_selections
  ADD COLUMN IF NOT EXISTS route_reversed boolean NOT NULL DEFAULT false;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS route_reversed boolean NOT NULL DEFAULT false;
