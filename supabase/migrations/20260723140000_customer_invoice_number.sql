-- Replace the standalone booking-level "supplier_reference" capture field with a
-- salesperson-entered customer-facing invoice number. The old field was not read
-- by any document, email, voucher, invoice, or quote (capture + audit only), so it
-- is safe to retire. The per-leg supplier_reference columns on
-- booking_package_selections / booking_transport_requests / voucher_service_blocks
-- are a SEPARATE system and are intentionally left untouched.

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS customer_invoice_number text;

COMMENT ON COLUMN public.bookings.customer_invoice_number IS
  'Salesperson-entered invoice number shown on customer-facing PDFs and emails. Required before moving to deposit_requested. Falls back to the internal invoices.invoice_number when empty.';

ALTER TABLE public.bookings DROP COLUMN IF EXISTS supplier_reference;
