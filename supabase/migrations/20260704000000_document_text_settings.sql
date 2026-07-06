-- Editable copy for quote/invoice documents and the shared email footer tagline.
-- Edited from Templates > Documents. Empty/missing values fall back to the
-- hardcoded defaults in code (lib/settings-access.ts), so this seed is optional
-- but keeps Settings > Documents pre-populated with the current wording.
INSERT INTO public.app_settings (key, value) VALUES
  ('quote_doc_title', 'PROVISIONAL QUOTATION'),
  ('quote_doc_footer_text', 'This quotation is valid until {{validUntil}} and is subject to availability. Prices are quoted in {{currency}}. Luxus Travel & Tours — Luxury Rail Journeys.'),
  ('quote_email_default_intro', 'Thank you for your enquiry. We are pleased to share your Luxus Travel & Tours quote for review.'),
  ('quote_email_accept_text', 'To accept this quote, please reply to this email and we will prepare the next booking steps for you.'),
  ('invoice_email_intro_deposit', 'Please find the deposit invoice for your Luxus booking below.'),
  ('invoice_email_intro_final', 'Please find the final invoice for your Luxus booking below.'),
  ('invoice_email_closing', 'Once payment has been received, we will update your booking and continue preparing the next step of your journey.'),
  ('email_footer_tagline', 'Luxury train journeys, handled with care.')
ON CONFLICT (key) DO NOTHING;
