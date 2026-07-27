-- Marks the moment a consultant has reviewed a machine-built (origin='auto') set of services and
-- confirmed them. Not a stage gate -- quote build stays the only hard gate (see build-from-package.ts)
-- -- this is purely a UI/audit signal for "Auto-filled" chip clearing and the discard-auto-build
-- action's own bookkeeping.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS services_confirmed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS services_confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
