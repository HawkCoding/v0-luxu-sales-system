-- Quote validity is hidden behind QUOTE_VALIDITY_ENABLED (lib/feature-flags.ts).
-- Remove the "valid until" wording from the stock quote email template and the
-- quote PDF footer setting, and split the intro into its own paragraph.
-- Both updates are guarded: a manager's customised wording is never overwritten.

update public.templates
set body_html = '<p>Dear {{customerName}},</p><p>Thank you for your enquiry.</p><p>We are pleased to share your Luxus Travel &amp; Tours quote for <strong>{{direction}}</strong>, departing <strong>{{departureDate}}</strong>.</p>{{quoteSummaryTable}}<p>The full quotation is also attached as a PDF.</p><p>To accept this quote, please reply to this email and we will prepare the next booking steps for you.</p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',
    version = version + 1,
    updated_at = now()
where key = 'quote_email'
  and body_html = '<p>Dear {{customerName}},</p><p>Thank you for your enquiry. We are pleased to share your Luxus Travel &amp; Tours quote for <strong>{{direction}}</strong>, departing <strong>{{departureDate}}</strong>.</p>{{quoteSummaryTable}}<p>This quote is valid until <strong>{{validityDate}}</strong>. The full quotation is also attached as a PDF.</p><p>To accept this quote, please reply to this email and we will prepare the next booking steps for you.</p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>';

update public.app_settings
set value = 'This quotation is subject to availability. Prices are quoted in {{currency}}. Luxus Travel & Tours — Luxury Rail Journeys.',
    updated_at = now()
where key = 'quote_doc_footer_text'
  and value = 'This quotation is valid until {{validUntil}} and is subject to availability. Prices are quoted in {{currency}}. Luxus Travel & Tours — Luxury Rail Journeys.';
