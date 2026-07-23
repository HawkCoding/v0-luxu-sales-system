-- Per-leg / per-trip supplier reference numbers, required before voucher generation.
ALTER TABLE public.booking_package_selections ADD COLUMN IF NOT EXISTS supplier_reference text;
ALTER TABLE public.booking_transport_requests ADD COLUMN IF NOT EXISTS supplier_reference text;

notify pgrst, 'reload schema';
