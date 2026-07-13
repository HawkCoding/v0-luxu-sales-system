-- Adds a booking_id marker so a "hidden" package can be scoped to a single booking.
-- Used by the Build Booking flow: instead of picking a predefined package, a salesperson
-- builds the trip's services live per booking; those services still flow through the
-- existing package/package_legs pricing + voucher pipeline via a booking-scoped package
-- that is never shown in the packages library.

ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE;

-- At most one hidden package per booking.
CREATE UNIQUE INDEX IF NOT EXISTS packages_booking_id_key
  ON public.packages (booking_id)
  WHERE booking_id IS NOT NULL;

COMMENT ON COLUMN public.packages.booking_id IS
  'Set only for booking-scoped "hidden" packages created by the Build Booking flow. '
  'List/browse queries against packages must filter booking_id IS NULL to avoid leaking these.';
