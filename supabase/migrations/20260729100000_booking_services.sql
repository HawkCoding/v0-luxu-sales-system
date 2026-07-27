-- Per-booking service list, replacing the "hidden package" trick (packages.booking_id) that
-- Build Booking used to reuse the catalogue package/package_legs pricing pipeline for a
-- booking-scoped, hand-built trip. That trick meant `packages` held two unrelated row kinds
-- (browsable catalogue packages and invisible per-booking ones), and every list/browse query had
-- to remember to filter `booking_id IS NULL` to avoid leaking the hidden rows.
--
-- booking_services / booking_service_units are the same shape as
-- booking_package_selections / booking_package_selection_units (see 20260518120000 and
-- 20260701050000) minus the package_leg_id indirection: a service belongs directly to a booking
-- and a supplier, because a booking-scoped build never needed the catalogue's leg/route
-- curation (package_leg_routes) -- Build Booking already links every route the chosen supplier
-- has (app/api/jobs/[id]/build-booking/route.ts), so eligible routes for a service are simply
-- "this supplier's active routes", queried directly instead of through a join table.
--
-- Catalogue packages (packages.booking_id IS NULL) are untouched by this migration and keep
-- using package_legs / booking_package_selections as before.
--
-- `origin` records whether a row was placed by the auto-build engine or by a consultant, so the
-- "Auto-filled" UI chip and the discard-auto-build action can distinguish them without guessing.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'service_origin') THEN
    CREATE TYPE public.service_origin AS ENUM ('auto', 'consultant');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.booking_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  label text,
  sort_order integer NOT NULL DEFAULT 0,
  selected boolean NOT NULL DEFAULT true,
  route_id uuid REFERENCES public.routes(id) ON DELETE SET NULL,
  route_reversed boolean NOT NULL DEFAULT false,
  -- Transfer/rental legs use this directly (the vehicle category); train/tour/airline/hotel legs
  -- carry their suite type per unit instead, in booking_service_units.
  suite_type_id uuid REFERENCES public.suite_types(id) ON DELETE SET NULL,
  rate_type_id uuid REFERENCES public.rate_types(id) ON DELETE SET NULL,
  service_date date,
  nights integer,
  date_anchor text,
  notes text,
  supplier_reference text,
  origin public.service_origin NOT NULL DEFAULT 'consultant',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT booking_services_date_anchor_check
    CHECK (date_anchor IS NULL OR date_anchor IN ('pre', 'post', 'custom'))
);

CREATE INDEX IF NOT EXISTS idx_booking_services_booking_id ON public.booking_services (booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_services_supplier_id ON public.booking_services (supplier_id);

ALTER TABLE public.booking_services ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'booking_services' AND policyname = 'biz_select'
  ) THEN
    CREATE POLICY biz_select ON public.booking_services FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'booking_services' AND policyname = 'biz_insert'
  ) THEN
    CREATE POLICY biz_insert ON public.booking_services FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'booking_services' AND policyname = 'biz_update'
  ) THEN
    CREATE POLICY biz_update ON public.booking_services FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'booking_services' AND policyname = 'biz_delete'
  ) THEN
    CREATE POLICY biz_delete ON public.booking_services FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

DROP TRIGGER IF EXISTS set_booking_services_updated_at ON public.booking_services;
CREATE TRIGGER set_booking_services_updated_at
  BEFORE UPDATE ON public.booking_services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT ALL ON TABLE public.booking_services TO anon;
GRANT ALL ON TABLE public.booking_services TO authenticated;
GRANT ALL ON TABLE public.booking_services TO service_role;

CREATE TABLE IF NOT EXISTS public.booking_service_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.booking_services(id) ON DELETE CASCADE,
  suite_type_id uuid REFERENCES public.suite_types(id) ON DELETE SET NULL,
  bedroom_type_id uuid REFERENCES public.bedroom_types(id) ON DELETE SET NULL,
  bedroom_layout_id uuid REFERENCES public.bedroom_layouts(id) ON DELETE SET NULL,
  bathroom_type_id uuid REFERENCES public.bathroom_types(id) ON DELETE SET NULL,
  adult_count integer NOT NULL DEFAULT 0,
  child_count integer NOT NULL DEFAULT 0,
  infant_count integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  origin public.service_origin NOT NULL DEFAULT 'consultant',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_service_units_service_id ON public.booking_service_units (service_id);

ALTER TABLE public.booking_service_units ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'booking_service_units' AND policyname = 'biz_select'
  ) THEN
    CREATE POLICY biz_select ON public.booking_service_units FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'booking_service_units' AND policyname = 'biz_insert'
  ) THEN
    CREATE POLICY biz_insert ON public.booking_service_units FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'booking_service_units' AND policyname = 'biz_update'
  ) THEN
    CREATE POLICY biz_update ON public.booking_service_units FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'booking_service_units' AND policyname = 'biz_delete'
  ) THEN
    CREATE POLICY biz_delete ON public.booking_service_units FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

DROP TRIGGER IF EXISTS set_booking_service_units_updated_at ON public.booking_service_units;
CREATE TRIGGER set_booking_service_units_updated_at
  BEFORE UPDATE ON public.booking_service_units
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT ALL ON TABLE public.booking_service_units TO anon;
GRANT ALL ON TABLE public.booking_service_units TO authenticated;
GRANT ALL ON TABLE public.booking_service_units TO service_role;

-- Transport requests (transfers/rentals) can now belong to a booking_services row instead of a
-- package_leg. Additive and nullable: catalogue-package transport requests keep using
-- package_leg_id untouched; only booking-scoped ones will populate service_id going forward.
ALTER TABLE public.booking_transport_requests
  ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.booking_services(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_booking_transport_requests_service_id
  ON public.booking_transport_requests (service_id);

-- Backfill every existing booking-scoped ("hidden") package into booking_services/units so
-- in-flight hand-built bookings survive the cutover. Everything backfilled here was hand-built
-- before auto-build existed, so it is tagged 'consultant', never 'auto'.
INSERT INTO public.booking_services (
  id, booking_id, supplier_id, label, sort_order, selected, route_id, route_reversed,
  suite_type_id, rate_type_id, service_date, nights, date_anchor, notes, supplier_reference,
  origin, created_at, updated_at
)
SELECT
  bps.id, p.booking_id, pl.supplier_id, pl.label, pl.sort_order, bps.selected, bps.route_id,
  bps.route_reversed, bps.suite_type_id, bps.rate_type_id, bps.service_date, bps.nights,
  bps.date_anchor, bps.notes, bps.supplier_reference, 'consultant', bps.created_at, bps.updated_at
FROM public.booking_package_selections bps
JOIN public.package_legs pl ON pl.id = bps.package_leg_id
JOIN public.packages p ON p.id = pl.package_id
WHERE p.booking_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.booking_services bs WHERE bs.id = bps.id);

INSERT INTO public.booking_service_units (
  id, service_id, suite_type_id, bedroom_type_id, bedroom_layout_id, bathroom_type_id,
  adult_count, child_count, infant_count, sort_order, origin, created_at, updated_at
)
SELECT
  bpsu.id, bpsu.selection_id, bpsu.suite_type_id, bpsu.bedroom_type_id, bpsu.bedroom_layout_id,
  bpsu.bathroom_type_id, bpsu.adult_count, bpsu.child_count, bpsu.infant_count, bpsu.sort_order,
  'consultant', bpsu.created_at, bpsu.updated_at
FROM public.booking_package_selection_units bpsu
JOIN public.booking_services bs ON bs.id = bpsu.selection_id
WHERE NOT EXISTS (SELECT 1 FROM public.booking_service_units u WHERE u.id = bpsu.id);

-- booking_services.id was set equal to the source booking_package_selections.id above, and
-- seedSelectionsForLegs always inserts exactly one selection per leg (including transport legs,
-- via the unique (booking_id, package_leg_id) index) -- so joining transport requests through
-- their leg's selection reaches the right new service id.
UPDATE public.booking_transport_requests btr
SET service_id = bps.id
FROM public.package_legs pl
JOIN public.packages p ON p.id = pl.package_id
JOIN public.booking_package_selections bps ON bps.package_leg_id = pl.id
WHERE pl.id = btr.package_leg_id
  AND p.booking_id IS NOT NULL
  AND btr.service_id IS NULL;

NOTIFY pgrst, 'reload schema';
