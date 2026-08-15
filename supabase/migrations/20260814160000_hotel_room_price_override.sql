-- Per-room price override for hotel legs.
--
-- Hotels price per room per night off a rate card, but what a hotel actually charges for a room
-- varies per property and per season in ways no rate card models -- single occupancy above all
-- (100% of the double rate at one hotel, 90% at the next, a flat amount at a third). Rather than
-- model those rules, a consultant types the amount the hotel quoted them for that specific room.
--
-- Deliberately booking-scoped and one-shot: this is NOT a rate and is never read back for a later
-- booking. The typed figure replaces the rate card's per-room-per-night price for this room on
-- this booking only, denominated in the same currency as the rate card it replaces (falling back
-- to booking_services.price_currency when the room has no card at all), and converted into the
-- quote currency by the same FX path as every other line.
--
-- set_at/set_by exist so the internal quote view can show who put the number there without a
-- reverse lookup through audit_logs. audit_logs still carries the full before/after via the
-- booking_services_updated write in app/api/jobs/[id]/services/route.ts.
ALTER TABLE public.booking_service_units
  ADD COLUMN IF NOT EXISTS manual_room_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS manual_room_price_set_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS manual_room_price_set_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.booking_service_units
  DROP CONSTRAINT IF EXISTS booking_service_units_manual_room_price_nonnegative;
ALTER TABLE public.booking_service_units
  ADD CONSTRAINT booking_service_units_manual_room_price_nonnegative
  CHECK (manual_room_price IS NULL OR manual_room_price >= 0);

COMMENT ON COLUMN public.booking_service_units.manual_room_price IS
  'Hotel legs only: consultant-typed price per room per night for this room on this booking, replacing the rate card. In the rate card''s currency (else booking_services.price_currency). Never reused across bookings.';
COMMENT ON COLUMN public.booking_service_units.manual_room_price_set_at IS
  'When manual_room_price was last changed to its current value. Null when there is no override.';
COMMENT ON COLUMN public.booking_service_units.manual_room_price_set_by IS
  'Who last changed manual_room_price to its current value. Null when there is no override.';

NOTIFY pgrst, 'reload schema';
