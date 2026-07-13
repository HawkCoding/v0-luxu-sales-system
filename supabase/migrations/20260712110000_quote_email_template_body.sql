-- Email automation Phase 2: quote emails render from the quote_email template
-- with a system-generated {{quoteSummaryTable}} block. Upgrade the stock
-- template body ONLY if it is still the unedited seeded version — a manager's
-- customised wording is never overwritten.

update public.templates
set body_html = '<p>Dear {{customerName}},</p><p>Thank you for your enquiry. We are pleased to share your Luxus Travel &amp; Tours quote for <strong>{{direction}}</strong>, departing <strong>{{departureDate}}</strong>.</p>{{quoteSummaryTable}}<p>This quote is valid until <strong>{{validityDate}}</strong>. The full quotation is also attached as a PDF.</p><p>To accept this quote, please reply to this email and we will prepare the next booking steps for you.</p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',
    version = version + 1,
    updated_at = now()
where key = 'quote_email'
  and body_html = '<p>Dear {{customerName}},</p><p>Please find attached your personalised quotation for the <strong>{{direction}}</strong> journey departing <strong>{{departureDate}}</strong>.</p><p>This quote is valid until <strong>{{validityDate}}</strong>. Total: <strong>R {{total}}</strong></p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>';

-- Quote email intro/accept wording now lives in the quote_email template.
delete from public.app_settings
where key in ('quote_email_default_intro', 'quote_email_accept_text');
