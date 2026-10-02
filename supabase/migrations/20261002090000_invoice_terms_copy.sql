-- Invoice Terms and Conditions wording (client change request, October 2026). The bullets now read:
--   • Amounts transferred should exclude all bank charges.
--   • Please use reference {ref} when making payment.            (fixed in code)
--   • Email proof of payment directly to your consultant.
--   • Reservations can only be confirmed once payment has been received.
-- Every statement is guarded on the previous stock wording, so a value an admin has already
-- customised is left exactly as it is, and re-running is a no-op.

UPDATE public.app_settings
SET value = 'Amounts transferred should exclude all bank charges.', updated_at = now()
WHERE key = 'invoice_doc_bank_charges_note'
  AND value = 'Please note that the amounts transferred should be exclusive of all bank charges.';

UPDATE public.app_settings
SET value = 'Email proof of payment directly to your consultant. Reservations can only be confirmed once payment has been received.', updated_at = now()
WHERE key = 'invoice_doc_payment_note'
  AND value IN (
    'Please email proof of payment. Reservations can only be confirmed once payment has been received.',
    'Please e-mail proof of payment. Reservations can only be confirmed once payment has been received.'
  );

-- A per-supplier-kind override that merely copied the old stock wording moves with it.
UPDATE public.supplier_kind_document_text
SET value = 'Amounts transferred should exclude all bank charges.', updated_at = now()
WHERE key = 'invoice_doc_bank_charges_note'
  AND value = 'Please note that the amounts transferred should be exclusive of all bank charges.';

UPDATE public.supplier_kind_document_text
SET value = 'Email proof of payment directly to your consultant. Reservations can only be confirmed once payment has been received.', updated_at = now()
WHERE key = 'invoice_doc_payment_note'
  AND value IN (
    'Please email proof of payment. Reservations can only be confirmed once payment has been received.',
    'Please e-mail proof of payment. Reservations can only be confirmed once payment has been received.'
  );
