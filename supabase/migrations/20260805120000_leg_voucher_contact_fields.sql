-- Voucher parity: the legacy voucher printed a named contact next to each leg's reference number
-- (e.g. "38562 - Carla") and an italic operational footnote under some legs (e.g. "Check in
-- IRENE COUNTRY LODGE 2h prior to departure"). Per-leg because a supplier's day-to-day contact
-- and a leg's one-off caveat both vary trip to trip, unlike the supplier-level fields added in
-- 20260805110000_supplier_voucher_contact_fields.sql.
ALTER TABLE public.booking_package_selections ADD COLUMN IF NOT EXISTS supplier_contact_name text;
ALTER TABLE public.booking_package_selections ADD COLUMN IF NOT EXISTS voucher_footnote text;

ALTER TABLE public.booking_services ADD COLUMN IF NOT EXISTS supplier_contact_name text;
ALTER TABLE public.booking_services ADD COLUMN IF NOT EXISTS voucher_footnote text;

ALTER TABLE public.booking_transport_requests ADD COLUMN IF NOT EXISTS supplier_contact_name text;
ALTER TABLE public.booking_transport_requests ADD COLUMN IF NOT EXISTS voucher_footnote text;

NOTIFY pgrst, 'reload schema';
