-- Voucher parity: the legacy Word voucher printed a street address, an emergency number and a
-- named contact person under each supplier's heading. These live on the supplier catalogue so
-- every leg for that supplier inherits them without re-entry.
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS street_address text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS emergency_phone text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS default_contact_name text;

NOTIFY pgrst, 'reload schema';
