-- Per-room pricing for hotel suppliers.
--
-- Hotels have always priced per person per night: the rate-card path in
-- lib/quotes/build-from-package.ts emits one line per passenger kind at
-- qty = headcount * charged_nights, off rate_cards.price_per_person. Some properties instead
-- quote a flat room rate whoever sleeps in it. This adds a pricing-basis toggle -- a
-- supplier-level default plus a per-stay override on booking_services -- so switching a
-- supplier never re-prices a stay that was already quoted under the old basis.
--
-- Mirrors 20260827100000_transfer_per_person_pricing.sql, with the default running the other
-- way: transfers were legacy 'per_vehicle' opting in to 'per_person', hotels are legacy
-- 'per_person' opting in to 'per_room'. Every existing supplier and every existing
-- booking_services row is therefore backfilled to 'per_person'.
--
-- Scope is hotel_property only. In per_room mode rate_cards.price_per_person is read as the
-- room's nightly rate and the child/infant fare columns are nulled on save -- see
-- app/api/suppliers/[slug]/route.ts, which already does exactly this for a per_vehicle
-- transfer supplier.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'accommodation_pricing_basis') THEN
    CREATE TYPE public.accommodation_pricing_basis AS ENUM ('per_person', 'per_room');
  END IF;
END $$;

-- Supplier-level default. A column DEFAULT is safe here (unlike the booking_services column
-- below) because 'per_person' is the long-standing behaviour: a supplier row that never gets
-- an explicit value keeps pricing exactly as it does today.
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS accommodation_pricing_basis public.accommodation_pricing_basis
    NOT NULL DEFAULT 'per_person';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_accommodation_pricing_basis_kind_check'
  ) THEN
    ALTER TABLE public.suppliers
      ADD CONSTRAINT suppliers_accommodation_pricing_basis_kind_check
      CHECK (kind = 'hotel_property' OR accommodation_pricing_basis = 'per_person');
  END IF;
END $$;

COMMENT ON COLUMN public.suppliers.accommodation_pricing_basis IS
  'Hotels only: default pricing basis for newly created booking_services rows. Existing rows carry their own accommodation_pricing_basis and are never re-priced by changing this.';

-- Per-stay basis.
--
-- Deliberately NULLable with no DEFAULT, and deliberately NOT NOT-NULL. The BEFORE INSERT trigger
-- below is what guarantees a real value; the column shape is chosen so the trigger actually gets
-- to run:
--
--   * A column DEFAULT would mean the value is never NULL at insert time, so the trigger would
--     never consult the supplier, and any of the five insert sites that forgets to stamp
--     (app/api/jobs/[id]/build-booking, app/api/jobs/[id]/services, lib/auto-build/build-from-enquiry,
--     lib/packages/seed-service-units, lib/inbound-email/import-booking) would create a
--     'per_person' stay under a 'per_room' hotel -- multiplying a whole-room rate by the headcount,
--     a silent ~2x overcharge on a double room.
--   * NOT NULL without a DEFAULT is what 20260827100000 did for booking_transport_requests, but
--     that table is only ever written through the replace_booking_transport_requests RPC, so the
--     generated Insert type never demanded the column. booking_services is written with plain
--     .insert() from a dozen places (QA fixtures included), so NOT NULL would force every one of
--     them to name a pricing basis they have no opinion about -- and the ones that guessed would
--     be guessing wrong exactly when it matters.
--
-- Nullable + trigger gives an omitted value the *supplier's* basis rather than a hardcoded one,
-- which is the safe reading in both directions. Readers still coalesce (`?? 'per_person'`) so a
-- row that somehow escaped the trigger prices the way every stay priced before this migration.
ALTER TABLE public.booking_services
  ADD COLUMN IF NOT EXISTS accommodation_pricing_basis public.accommodation_pricing_basis;

-- Backfill every existing stay to the basis it was actually quoted under, so no live booking
-- re-prices when the pricer starts reading this column.
UPDATE public.booking_services
  SET accommodation_pricing_basis = 'per_person'
  WHERE accommodation_pricing_basis IS NULL;

COMMENT ON COLUMN public.booking_services.accommodation_pricing_basis IS
  'How this stay prices: per_person (adult/child/infant fares x nights, the legacy behaviour) or per_room (one nightly room rate x nights). Stamped from the supplier default by trg_stamp_booking_service_pricing_basis when the insert omits it; always per_person for non-hotel kinds.';

-- Stamps a NULL accommodation_pricing_basis from the supplier's current default at insert time.
--
-- booking_services holds every supplier kind (unlike booking_transport_requests, which carries
-- its own service_type column and could be constrained with a plain CHECK), so the kind has to
-- be looked up on suppliers. That also means the "non-hotel rows are always per_person" rule
-- cannot be a CHECK constraint -- it lives here and in the services API guard.
CREATE OR REPLACE FUNCTION public.stamp_booking_service_pricing_basis()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.accommodation_pricing_basis IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.supplier_id IS NULL THEN
    NEW.accommodation_pricing_basis := 'per_person';
    RETURN NEW;
  END IF;

  SELECT s.accommodation_pricing_basis INTO NEW.accommodation_pricing_basis
  FROM public.suppliers s
  WHERE s.id = NEW.supplier_id AND s.kind = 'hotel_property';

  -- No row matched (a non-hotel supplier, or a missing one): everything else prices per person.
  IF NEW.accommodation_pricing_basis IS NULL THEN
    NEW.accommodation_pricing_basis := 'per_person';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_booking_service_pricing_basis ON public.booking_services;
CREATE TRIGGER trg_stamp_booking_service_pricing_basis
  BEFORE INSERT ON public.booking_services
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_booking_service_pricing_basis();

NOTIFY pgrst, 'reload schema';
