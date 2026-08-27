-- Per-person pricing for transfer suppliers.
--
-- Transfers have always priced flat "per vehicle" (rate_cards.price_per_person reused as a
-- vehicle price, per lib/types.ts SUPPLIER_VOCABULARY.transfers.priceLabel). Some transfer
-- suppliers instead quote per seat -- adult/child/infant fares per vehicle category, exactly
-- like train suites. This adds a pricing-basis toggle: a supplier-level default plus a
-- per-request override, so switching a supplier never re-prices a transfer that was already
-- quoted under the old basis.
--
-- Scope is transfers only. Rentals stay per-vehicle-per-day, always -- see the
-- booking_transport_requests_rental_basis_check below, which is the single constraint a
-- future "per-person rentals" feature would need to relax.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transport_pricing_basis') THEN
    CREATE TYPE public.transport_pricing_basis AS ENUM ('per_vehicle', 'per_person');
  END IF;
END $$;

-- Supplier-level default. Existing suppliers (and every non-transfer kind) stay 'per_vehicle'.
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS transfer_pricing_basis public.transport_pricing_basis NOT NULL DEFAULT 'per_vehicle';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_transfer_pricing_basis_kind_check'
  ) THEN
    ALTER TABLE public.suppliers
      ADD CONSTRAINT suppliers_transfer_pricing_basis_kind_check
      CHECK (kind = 'transfers' OR transfer_pricing_basis = 'per_vehicle');
  END IF;
END $$;

COMMENT ON COLUMN public.suppliers.transfer_pricing_basis IS
  'Transfers only: default pricing basis for newly created booking_transport_requests rows. Existing rows carry their own pricing_basis and are never re-priced by changing this.';

-- Per-request columns. adult/child/infant counts and the two extra overrides are nullable --
-- NULL counts mean "use the booking projected totals" (see lib/pricing/transfer-basis.ts
-- resolveTransferPax), and the existing price_override column becomes the adult override in
-- per_person mode.
ALTER TABLE public.booking_transport_requests
  ADD COLUMN IF NOT EXISTS pricing_basis public.transport_pricing_basis,
  ADD COLUMN IF NOT EXISTS adult_count integer,
  ADD COLUMN IF NOT EXISTS child_count integer,
  ADD COLUMN IF NOT EXISTS infant_count integer,
  ADD COLUMN IF NOT EXISTS price_override_child numeric(12,2),
  ADD COLUMN IF NOT EXISTS price_override_infant numeric(12,2);

-- Backfill existing rows explicitly, then lock the column NOT NULL. No DEFAULT is set on the
-- column itself: a bare DEFAULT would let any insert site that forgets to stamp a value create
-- a 'per_vehicle' row under a 'per_person' supplier, which prices the adult fare as the whole
-- vehicle -- a silent ~6x undercharge. Instead a BEFORE INSERT trigger below fills a NULL from
-- the supplier's default, while an explicit value (a deliberate per-leg override) is respected.
UPDATE public.booking_transport_requests SET pricing_basis = 'per_vehicle' WHERE pricing_basis IS NULL;

ALTER TABLE public.booking_transport_requests
  ALTER COLUMN pricing_basis SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'booking_transport_requests_pax_counts_check'
  ) THEN
    ALTER TABLE public.booking_transport_requests
      ADD CONSTRAINT booking_transport_requests_pax_counts_check
      CHECK (
        (adult_count  IS NULL OR adult_count  >= 0) AND
        (child_count  IS NULL OR child_count  >= 0) AND
        (infant_count IS NULL OR infant_count >= 0)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'booking_transport_requests_override_prices_check'
  ) THEN
    ALTER TABLE public.booking_transport_requests
      ADD CONSTRAINT booking_transport_requests_override_prices_check
      CHECK (
        (price_override_child  IS NULL OR price_override_child  >= 0) AND
        (price_override_infant IS NULL OR price_override_infant >= 0)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'booking_transport_requests_rental_basis_check'
  ) THEN
    ALTER TABLE public.booking_transport_requests
      ADD CONSTRAINT booking_transport_requests_rental_basis_check
      CHECK (service_type = 'transfer' OR pricing_basis = 'per_vehicle');
  END IF;
END $$;

-- Stamps a NULL pricing_basis from the supplier's current default at insert time. Only fires
-- for a NULL value, so an explicit basis passed by the app (including the carry-forward the
-- transport-requests API performs across its delete/reinsert save cycle) is never overwritten.
CREATE OR REPLACE FUNCTION public.stamp_transport_request_pricing_basis()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.pricing_basis IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.service_type <> 'transfer' OR NEW.supplier_id IS NULL THEN
    NEW.pricing_basis := 'per_vehicle';
    RETURN NEW;
  END IF;

  SELECT transfer_pricing_basis INTO NEW.pricing_basis
  FROM public.suppliers
  WHERE id = NEW.supplier_id AND kind = 'transfers';

  IF NEW.pricing_basis IS NULL THEN
    NEW.pricing_basis := 'per_vehicle';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_transport_request_pricing_basis ON public.booking_transport_requests;
CREATE TRIGGER trg_stamp_transport_request_pricing_basis
  BEFORE INSERT ON public.booking_transport_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_transport_request_pricing_basis();

-- Rebuild the replace-set RPC to carry the six new columns through the full delete/reinsert
-- cycle (same function last touched by 20260820210000_transfer_complimentary.sql). Any column
-- missing from this list is silently dropped on every transport-requests save.
CREATE OR REPLACE FUNCTION public.replace_booking_transport_requests(
  p_booking_id uuid,
  p_transport_requests jsonb,
  p_rental_details jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.bookings WHERE id = p_booking_id) THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  DELETE FROM public.booking_transport_requests
  WHERE booking_id = p_booking_id;

  INSERT INTO public.booking_transport_requests (
    id,
    booking_id,
    service_type,
    supplier_id,
    route_id,
    suite_type_id,
    service_id,
    pickup_point,
    dropoff_point,
    pickup_at,
    date_anchor,
    passenger_count,
    luggage_count,
    flight_number,
    price_override,
    price_override_set_at,
    price_override_set_by,
    complimentary,
    notes,
    sort_order,
    pricing_basis,
    adult_count,
    child_count,
    infant_count,
    price_override_child,
    price_override_infant
  )
  SELECT
    request.id,
    p_booking_id,
    request.service_type,
    request.supplier_id,
    request.route_id,
    request.suite_type_id,
    request.service_id,
    request.pickup_point,
    request.dropoff_point,
    request.pickup_at,
    request.date_anchor,
    request.passenger_count,
    request.luggage_count,
    request.flight_number,
    request.price_override,
    request.price_override_set_at,
    request.price_override_set_by,
    coalesce(request.complimentary, false),
    request.notes,
    request.sort_order,
    request.pricing_basis,
    request.adult_count,
    request.child_count,
    request.infant_count,
    request.price_override_child,
    request.price_override_infant
  FROM jsonb_to_recordset(p_transport_requests) AS request(
    id uuid,
    service_type text,
    supplier_id uuid,
    route_id uuid,
    suite_type_id uuid,
    service_id uuid,
    pickup_point text,
    dropoff_point text,
    pickup_at timestamptz,
    date_anchor text,
    passenger_count integer,
    luggage_count integer,
    flight_number text,
    price_override numeric,
    price_override_set_at timestamptz,
    price_override_set_by uuid,
    complimentary boolean,
    notes text,
    sort_order integer,
    pricing_basis public.transport_pricing_basis,
    adult_count integer,
    child_count integer,
    infant_count integer,
    price_override_child numeric,
    price_override_infant numeric
  );

  INSERT INTO public.booking_vehicle_rental_details (
    transport_request_id,
    return_at,
    return_cutoff_time
  )
  SELECT
    rental_detail.transport_request_id,
    rental_detail.return_at,
    rental_detail.return_cutoff_time
  FROM jsonb_to_recordset(p_rental_details) AS rental_detail(
    transport_request_id uuid,
    return_at timestamptz,
    return_cutoff_time time
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_booking_transport_requests(uuid, jsonb, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
