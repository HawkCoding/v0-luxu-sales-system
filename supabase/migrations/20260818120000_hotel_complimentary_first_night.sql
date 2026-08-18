-- Per-room "first night complimentary" for hotel legs.
--
-- Hotels routinely gift the first night of a stay and charge the rest. Until now the only way to
-- express a comp was to type R0 as the room's per-night price, which zeroed the whole stay -- a
-- two-night stay at R4 000 came out at R0 instead of R4 000.
--
-- This flag is deliberately separate from manual_room_price so the two compose: the room keeps a
-- real per-night price (its rate card's, or a consultant-typed override) and the flag drops one
-- night from what is charged. Typing R0 by hand still means every night is free, which is how
-- existing quotes were captured and remains the way to comp an entire stay.
--
-- Per room, not per leg: a booking with two rooms and the flag set on both gifts two room-nights,
-- which is how hotels quote it.
ALTER TABLE public.booking_service_units
  ADD COLUMN IF NOT EXISTS complimentary_first_night boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.booking_service_units.complimentary_first_night IS
  'Hotel legs only: when true the first night of this room''s stay is not charged, so the quote line prices nights - 1 at the room''s per-night price. Independent of manual_room_price, which stays the real per-night rate.';

NOTIFY pgrst, 'reload schema';
