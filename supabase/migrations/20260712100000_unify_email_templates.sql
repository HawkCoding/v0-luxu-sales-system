-- Email automation Phase 1: the templates table becomes the single source of
-- truth for outbound email wording.
-- 1. Ensure ALL system template keys exist. The original four (quote_email,
--    follow_up, deposit_request, voucher_email) were previously only created
--    by seed.sql, which never runs on remote databases — without this insert
--    the Templates page on dev/prod has nothing to edit. `on conflict (key)
--    do nothing` keeps any existing (possibly customised) rows untouched.
-- 2. Migrate any customised app_settings.quote_follow_up_template value into
--    templates.follow_up (the follow-up worker now reads the templates table).
-- 3. Retire the quote_follow_up_template app_setting.

insert into public.templates (id, key, subject, body_html, version, active, is_system, created_at, updated_at)
values
  (
    gen_random_uuid(),
    'quote_email',
    'Your Quote — {{jobNumber}}',
    '<p>Dear {{customerName}},</p><p>Thank you for your enquiry. We are pleased to share your Luxus Travel &amp; Tours quote for <strong>{{direction}}</strong>, departing <strong>{{departureDate}}</strong>.</p>{{quoteSummaryTable}}<p>This quote is valid until <strong>{{validityDate}}</strong>. The full quotation is also attached as a PDF.</p><p>To accept this quote, please reply to this email and we will prepare the next booking steps for you.</p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',
    1, true, true, now(), now()
  ),
  (
    gen_random_uuid(),
    'follow_up',
    'Following up on your enquiry — {{jobNumber}}',
    '<p>Dear {{customerName}},</p><p>We are following up on the quotation sent on <strong>{{lastSentDate}}</strong>. Availability on peak dates can be limited — we would love to secure your suite.</p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',
    1, true, true, now(), now()
  ),
  (
    gen_random_uuid(),
    'deposit_request',
    'Deposit Invoice — {{jobNumber}}',
    '<p>Dear {{customerName}},</p><p>Thank you for confirming your reservation. A deposit of <strong>R {{depositAmount}}</strong> ({{depositPercentage}}%) is required to secure your booking, due by <strong>{{dueDate}}</strong>. Invoice <strong>{{invoiceNumber}}</strong> is attached.</p>{{bankingDetails}}<p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',
    1, true, true, now(), now()
  ),
  (
    gen_random_uuid(),
    'voucher_email',
    'Your Travel Voucher — {{jobNumber}}',
    '<p>Dear {{customerName}},</p><p>Your travel voucher for the <strong>{{direction}}</strong> journey is attached, together with your itinerary. Please present the voucher to your service provider on arrival. Safe travels!</p><p>Warm regards,<br/>Luxus Travel &amp; Tours</p>',
    1, true, true, now(), now()
  ),
  (
    gen_random_uuid(),
    'final_invoice',
    'Final Invoice — {{jobNumber}}',
    '<p>Dear {{customerName}},</p><p>Please find attached your final invoice <strong>{{invoiceNumber}}</strong> for <strong>R {{amountDue}}</strong>, due by <strong>{{dueDate}}</strong>.</p>{{bankingDetails}}<p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',
    1, true, true, now(), now()
  ),
  (
    gen_random_uuid(),
    'payment_reminder',
    'Payment Reminder — Invoice {{invoiceNumber}}',
    '<p>Dear {{customerName}},</p><p>This is a friendly reminder that invoice <strong>{{invoiceNumber}}</strong> for <strong>R {{amountDue}}</strong> is due by <strong>{{dueDate}}</strong>. Please find the invoice attached.</p>{{bankingDetails}}<p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',
    1, true, true, now(), now()
  ),
  (
    gen_random_uuid(),
    'itinerary_email',
    'Your Itinerary — {{jobNumber}}',
    '<p>Dear {{customerName}},</p><p>Please find attached your itinerary for <strong>{{tripTitle}}</strong>, departing <strong>{{departureDate}}</strong>.</p><p>Warm regards,<br/>Luxus Travel &amp; Tours</p>',
    1, true, true, now(), now()
  ),
  (
    gen_random_uuid(),
    'thank_you',
    'Thank you for travelling with us — {{jobNumber}}',
    '<p>Dear {{customerName}},</p><p>We hope you had a wonderful journey on <strong>{{routeName}}</strong>. Thank you for travelling with Luxus Travel &amp; Tours — it was a privilege to arrange your trip.</p><p>We would love to welcome you aboard again.</p><p>Warm regards,<br/>{{consultantName}}<br/>Luxus Travel &amp; Tours</p>',
    1, true, true, now(), now()
  )
on conflict (key) do nothing;

-- Preserve a customised follow-up template (previously edited via Settings).
update public.templates t
set body_html = s.value,
    version = t.version + 1,
    updated_at = now()
from public.app_settings s
where t.key = 'follow_up'
  and s.key = 'quote_follow_up_template'
  and s.value is not null
  and s.value <> t.body_html;

delete from public.app_settings where key = 'quote_follow_up_template';
