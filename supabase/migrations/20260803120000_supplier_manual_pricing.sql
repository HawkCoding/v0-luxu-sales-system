-- Phase 1: manual (typed) pricing for suppliers whose fares can't live in a standing rate
-- card -- airfare above all. pricing_mode gates whether a supplier's quote lines come from
-- rate_cards (unchanged default) or are typed per booking-service-unit at quote-build time.
-- Airline suppliers are backfilled to 'manual'; their existing rate_cards rows are left in
-- place as inert history, not read once the app stops querying them for this kind.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'supplier_pricing_mode') THEN
    CREATE TYPE public.supplier_pricing_mode AS ENUM ('rate_card', 'manual');
  END IF;
END $$;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS pricing_mode public.supplier_pricing_mode NOT NULL DEFAULT 'rate_card';

UPDATE public.suppliers SET pricing_mode = 'manual' WHERE kind = 'airline';

-- Per-unit typed fares (adult required in practice, child/infant optional -- NULL means "same
-- as adult" the same way rate_cards.child_price/infant_price fall back today).
ALTER TABLE public.booking_service_units
  ADD COLUMN IF NOT EXISTS manual_adult_price  numeric(12,2),
  ADD COLUMN IF NOT EXISTS manual_child_price  numeric(12,2),
  ADD COLUMN IF NOT EXISTS manual_infant_price numeric(12,2);

ALTER TABLE public.booking_service_units
  DROP CONSTRAINT IF EXISTS booking_service_units_manual_prices_nonnegative;
ALTER TABLE public.booking_service_units
  ADD CONSTRAINT booking_service_units_manual_prices_nonnegative
  CHECK (
    (manual_adult_price  IS NULL OR manual_adult_price  >= 0) AND
    (manual_child_price  IS NULL OR manual_child_price  >= 0) AND
    (manual_infant_price IS NULL OR manual_infant_price >= 0)
  );
