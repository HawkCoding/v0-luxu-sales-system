-- SA-Rail PDF redesign (templates approved by the client, September 2026): move the document copy
-- that still holds the stock wording onto the templates' wording. Every statement is guarded on the
-- old value, so a row an admin has already customised is left exactly as it is, and re-running is a
-- no-op.

-- Letterhead line on every PDF (and the brand block heading in e-mails).
UPDATE public.app_settings
SET value = 'THE BLUE TRAIN - ROVOS RAIL - KRUGER SHALATI', updated_at = now()
WHERE key = 'brand_block_heading'
  AND value = 'BLUE TRAIN | ROVOS RAIL | KRUGER SHALATI';

-- The seal. Settings uploads always land at this one bucket path (with a ?t= cache-buster), and the
-- file there is the old seal every pre-redesign PDF printed. Clearing the setting points the PDFs at
-- the templates' new seal committed in the repo. E-mails fall back to that same bucket file when
-- this is blank, so they are unchanged. An admin can upload a different seal again in Settings.
UPDATE public.app_settings
SET value = '', updated_at = now()
WHERE key = 'brand_block_logo_url'
  AND value LIKE '%/storage/v1/object/public/voucher-assets/brand/sarail-footer-logo.png%';

-- The quote's first-section heading (also the quote e-mail summary's heading).
UPDATE public.app_settings
SET value = 'Travel Package Includes', updated_at = now()
WHERE key = 'quote_doc_includes_heading'
  AND value = 'Your Package Includes';

-- The quote's closing line: the templates end at the availability sentence; the company tagline
-- that used to trail it now lives in the footer.
UPDATE public.app_settings
SET value = 'This quotation is subject to availability. Prices are quoted in {{currency}}.', updated_at = now()
WHERE key = 'quote_doc_footer_text'
  AND value LIKE 'This quotation is subject to availability. Prices are quoted in {{currency}}.%'
  AND value <> 'This quotation is subject to availability. Prices are quoted in {{currency}}.';

-- Invoice Terms and Conditions wording.
UPDATE public.app_settings
SET value = 'Please email proof of payment. Reservations can only be confirmed once payment has been received.', updated_at = now()
WHERE key = 'invoice_doc_payment_note'
  AND value = 'Please e-mail proof of payment. Reservations can only be confirmed once payment has been received.';

-- Voucher hand-over note: "settle extras directly with the service providers".
UPDATE public.voucher_template
SET guidance_text = replace(guidance_text, 'settle extras direct with', 'settle extras directly with')
WHERE guidance_text LIKE '%settle extras direct with%';

ALTER TABLE public.voucher_template
  ALTER COLUMN guidance_text SET DEFAULT 'Please hand to your service provider. Pre-payment was made by Luxus Travel & Tours for all services mentioned below. Guests must settle extras directly with the service providers.';
