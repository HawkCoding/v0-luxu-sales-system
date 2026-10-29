-- Per-person fare override for train suites.
--
-- Train legs price each suite per person sharing off a rate card (adult / child / infant). What
-- the operator actually charges for a specific booking sometimes departs from that card (a special,
-- a negotiated rate), so the consultant can type the per-person fare for each passenger kind on a
-- single suite row -- the same idea transfers already have (booking_transport_requests
-- .price_override / _child / _infant).
--
-- Semantics (applied in lib/quotes/build-from-package.ts):
--   * Each kind is independent. A blank (NULL) kind keeps the rate card's price for that kind.
--   * A typed fare is FINAL: when the adult fare is overridden the solo-suite single supplement is
--     NOT added on top. When only child/infant are overridden the adult still prices off the card,
--     so the card's single supplement still applies to it.
--   * Rate-card train legs only (manual-priced train suppliers already type their fares into
--     manual_adult_price / _child_price / _infant_price, which these columns deliberately do NOT
--     reuse). The services API rejects the override on any non-train unit.
--
-- Deliberately booking-scoped and one-shot: this is NOT a rate and is never read back for a later
-- booking. Denominated in the rate card's currency (else booking_services.price_currency).
--
-- set_at/set_by mirror manual_tour_price_set_at/_set_by so the internal quote view can show who put
-- the number there without a reverse lookup through audit_logs.
ALTER TABLE public.booking_service_units
  ADD COLUMN IF NOT EXISTS fare_override_adult numeric(12,2),
  ADD COLUMN IF NOT EXISTS fare_override_child numeric(12,2),
  ADD COLUMN IF NOT EXISTS fare_override_infant numeric(12,2),
  ADD COLUMN IF NOT EXISTS fare_override_set_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS fare_override_set_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.booking_service_units
  DROP CONSTRAINT IF EXISTS booking_service_units_fare_override_nonnegative;
ALTER TABLE public.booking_service_units
  ADD CONSTRAINT booking_service_units_fare_override_nonnegative
  CHECK (
    (fare_override_adult IS NULL OR fare_override_adult >= 0)
    AND (fare_override_child IS NULL OR fare_override_child >= 0)
    AND (fare_override_infant IS NULL OR fare_override_infant >= 0)
  );

COMMENT ON COLUMN public.booking_service_units.fare_override_adult IS
  'Train rate-card legs only: consultant-typed per-person adult fare for this suite on this booking, replacing the card price and suppressing the single supplement. NULL = use the card. Never reused across bookings.';
COMMENT ON COLUMN public.booking_service_units.fare_override_child IS
  'Train rate-card legs only: consultant-typed per-person child fare for this suite on this booking. NULL = use the card.';
COMMENT ON COLUMN public.booking_service_units.fare_override_infant IS
  'Train rate-card legs only: consultant-typed per-person infant fare for this suite on this booking. NULL = use the card.';
COMMENT ON COLUMN public.booking_service_units.fare_override_set_at IS
  'When any fare_override_* was last changed to its current value. Null when there is no override.';
COMMENT ON COLUMN public.booking_service_units.fare_override_set_by IS
  'Who last changed a fare_override_* to its current value. Null when there is no override.';

NOTIFY pgrst, 'reload schema';
