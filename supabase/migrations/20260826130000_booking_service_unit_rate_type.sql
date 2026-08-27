-- Per-tour-unit rate type.
--
-- rateTypeId used to live only on booking_services (the leg), so every tour card on a supplier
-- shared one rate type -- editing it from any card silently repriced every tour on that leg. Tour
-- units are now independently priced (see the pax-independence change alongside this migration),
-- so each unit needs its own rate type too. Nullable: unset falls back to the leg's rate type,
-- then the supplier's default, same resolution order booking_services.rate_type_id already uses.
ALTER TABLE public.booking_service_units
  ADD COLUMN IF NOT EXISTS rate_type_id uuid REFERENCES public.rate_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_booking_service_units_rate_type
  ON public.booking_service_units (rate_type_id)
  WHERE rate_type_id IS NOT NULL;

COMMENT ON COLUMN public.booking_service_units.rate_type_id IS
  'Tour units only: this unit''s own rate type, overriding the leg-level booking_services.rate_type_id. Null falls back to the leg, then the supplier default.';

NOTIFY pgrst, 'reload schema';
