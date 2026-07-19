-- Billing identity for customers + company contact details for invoice PDFs.
--
-- Driver: a South African full tax invoice (VAT Act s20(4)) must carry the
-- recipient's name, address and VAT number once the supply exceeds R5 000 —
-- which every rail journey does. Only the supplier side was captured before.

-- Recipient billing block ("Company / Address / VAT / Code" on the invoice).
ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_line1 text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_line2 text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS postal_code text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS vat_number text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS fax text;

COMMENT ON COLUMN customers.vat_number IS
  'Recipient VAT registration number. Required on full tax invoices for supplies over R5 000.';
COMMENT ON COLUMN customers.postal_code IS
  'Rendered as "Code" in the invoice billing block.';

-- Supplier contact details for the invoice footer. Seeded empty so an
-- unconfigured field is omitted from the PDF rather than printing a blank label.
INSERT INTO public.app_settings (key, value) VALUES
  ('company_tel', ''),
  ('company_cell', ''),
  ('company_fax', ''),
  ('company_email', ''),
  ('company_website', '')
ON CONFLICT (key) DO NOTHING;

-- Standing invoice notices. Defaults mirror the wording already in use on the
-- documents the sales team sends today.
INSERT INTO public.app_settings (key, value) VALUES
  (
    'invoice_doc_payment_note',
    'Please e-mail proof of payment. Reservations can only be confirmed once payment has been received.'
  ),
  (
    'invoice_doc_bank_charges_note',
    'Please note that the amounts transferred should be exclusive of all bank charges.'
  )
ON CONFLICT (key) DO NOTHING;
