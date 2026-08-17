-- Job-level billing party for the invoice header. Company, VAT and postal
-- address used to be read from the customer profile at invoice time
-- (lib/invoices/build-invoice-view.ts) with no way to fill or override them
-- per booking. They now live on booking_reservation_details and the invoice
-- reads only this row — no customer fallback. Backfilled from the customer
-- profile below so existing bookings keep printing what they print today.

ALTER TABLE public.booking_reservation_details
  ADD COLUMN IF NOT EXISTS billing_company_name text,
  ADD COLUMN IF NOT EXISTS billing_vat_number text,
  ADD COLUMN IF NOT EXISTS billing_address_line1 text,
  ADD COLUMN IF NOT EXISTS billing_address_line2 text,
  ADD COLUMN IF NOT EXISTS billing_city text,
  ADD COLUMN IF NOT EXISTS billing_province text,
  ADD COLUMN IF NOT EXISTS billing_postal_code text,
  ADD COLUMN IF NOT EXISTS billing_country text;

COMMENT ON COLUMN public.booking_reservation_details.billing_company_name IS
  'Printed as "Company" on the invoice PDF header. No fallback to customers.company_name.';
COMMENT ON COLUMN public.booking_reservation_details.billing_vat_number IS
  'Printed as "VAT" on the invoice PDF header. No fallback to customers.vat_number.';
COMMENT ON COLUMN public.booking_reservation_details.billing_postal_code IS
  'Printed as "Code" on the invoice PDF header. No fallback to customers.postal_code.';

-- Ensure every booking has a details row to backfill into.
INSERT INTO public.booking_reservation_details (booking_id)
SELECT b.id
FROM public.bookings b
LEFT JOIN public.booking_reservation_details d ON d.booking_id = b.id
WHERE d.booking_id IS NULL;

-- Backfill from the customer profile once. COALESCE keeps this idempotent
-- and never clobbers a value a salesperson has already entered.
UPDATE public.booking_reservation_details d
SET
  billing_company_name = COALESCE(d.billing_company_name, c.company_name),
  billing_vat_number = COALESCE(d.billing_vat_number, c.vat_number),
  billing_address_line1 = COALESCE(d.billing_address_line1, c.address_line1),
  billing_address_line2 = COALESCE(d.billing_address_line2, c.address_line2),
  billing_city = COALESCE(d.billing_city, c.city),
  billing_province = COALESCE(d.billing_province, c.province),
  billing_postal_code = COALESCE(d.billing_postal_code, c.postal_code),
  billing_country = COALESCE(d.billing_country, c.country)
FROM public.bookings b
JOIN public.customers c ON c.id = b.customer_id
WHERE d.booking_id = b.id;

NOTIFY pgrst, 'reload schema';
