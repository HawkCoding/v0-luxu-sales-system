-- Flat price override for tour legs.
--
-- Tours price per passenger type (adult/child/infant) off a rate card, same as trains/airlines.
-- What a tour operator actually charges for a specific booking sometimes departs from that card
-- (a negotiated group rate, a one-off deal) with no clean way to model it as separate per-type
-- fares. Rather than force the consultant to reverse-engineer adult/child/infant splits, they type
-- one flat amount that replaces the whole tour line for this unit -- same posture as a transfer's
-- price_override, just stored alongside the hotel override on booking_service_units since that's
-- where tour units already live.
--
-- Deliberately booking-scoped and one-shot: this is NOT a rate and is never read back for a later
-- booking. Denominated in the same currency as the rate card it replaces (falling back to
-- booking_services.price_currency when nothing covers it), converted into the quote currency by
-- the same FX path as every other line.
--
-- set_at/set_by exist so the internal quote view can show who put the number there without a
-- reverse lookup through audit_logs. audit_logs still carries the full before/after via the
-- booking_services_updated write in app/api/jobs/[id]/services/route.ts.
ALTER TABLE public.booking_service_units
  ADD COLUMN IF NOT EXISTS manual_tour_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS manual_tour_price_set_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS manual_tour_price_set_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.booking_service_units
  DROP CONSTRAINT IF EXISTS booking_service_units_manual_tour_price_nonnegative;
ALTER TABLE public.booking_service_units
  ADD CONSTRAINT booking_service_units_manual_tour_price_nonnegative
  CHECK (manual_tour_price IS NULL OR manual_tour_price >= 0);

COMMENT ON COLUMN public.booking_service_units.manual_tour_price IS
  'Tour legs only: consultant-typed flat price for this tour unit on this booking, replacing the rate card. In the rate card''s currency (else booking_services.price_currency). Never reused across bookings.';
COMMENT ON COLUMN public.booking_service_units.manual_tour_price_set_at IS
  'When manual_tour_price was last changed to its current value. Null when there is no override.';
COMMENT ON COLUMN public.booking_service_units.manual_tour_price_set_by IS
  'Who last changed manual_tour_price to its current value. Null when there is no override.';

NOTIFY pgrst, 'reload schema';
