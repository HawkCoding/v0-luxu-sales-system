-- Hotel-only "luggage storage available at reception" flag, printed on the quote itinerary as a
-- suffix on the check-out line (see lib/quotes/quote-presentation.ts, describeEndLine). A property
-- fact, not a per-room fact, so it lives leg-level on booking_services alongside nights/notes
-- rather than per-room on booking_service_units.

ALTER TABLE public.booking_services
  ADD COLUMN IF NOT EXISTS luggage_storage_available boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.booking_services.luggage_storage_available IS
  'Hotel legs only -- prints a luggage-storage note after the quote itinerary check-out line.';

NOTIFY pgrst, 'reload schema';
