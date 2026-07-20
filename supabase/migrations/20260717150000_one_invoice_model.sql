-- One-invoice model: the client receives a single confirmation invoice per
-- booking (same number, re-issued with an updated status block), matching the
-- sales team's real workflow. Adds configurable invoice status labels, guest
-- names on the booking, reservation-form tracking, and mirrors the client
-- email wording to the correspondence the sales team sends today.

-- 1. The reservation-form-received tick captured at Quote Accepted. Guest
--    names on the invoice come from the existing travellers table.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reservation_form_received_at timestamptz;

COMMENT ON COLUMN bookings.reservation_form_received_at IS
  'When the signed reservation form came back from the client (manual tick).';

-- 2. Manual override of the invoice''s client-facing status label. When null
--    the label is derived from the booking payment state against the
--    invoice_status_options roles.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS display_status text;

-- 3. Deposit and final invoice rows now share one client-facing invoice number
--    per booking, so the number can no longer be globally unique.
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_invoice_number_key;
CREATE INDEX IF NOT EXISTS invoices_invoice_number_idx ON invoices (invoice_number);

-- 4. Configurable status labels shown in the invoice header. The four system
--    roles drive automatic derivation; labels are editable in Settings.
INSERT INTO public.app_settings (key, value) VALUES
  (
    'invoice_status_options',
    '[{"role":"provisional","label":"Provisional"},{"role":"confirmed","label":"Confirmed"},{"role":"paid","label":"Paid in Full"},{"role":"cancelled","label":"Cancelled"}]'
  )
ON CONFLICT (key) DO NOTHING;

-- 5. New system templates for the reservation-received acknowledgement and the
--    payment-received confirmation.
insert into public.templates (id, key, subject, body_html, version, active, is_system, created_at, updated_at)
values
  (
    gen_random_uuid(),
    'reservation_received',
    'Reservation received — {{jobNumber}}',
    '<p>Dear {{customerName}},</p><p>Thank you for your reservation form well received.</p><p>Confirmation invoice with payment instructions to follow shortly.</p><p>In the meantime, I have secured your suite for you.</p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',
    1, true, true, now(), now()
  ),
  (
    gen_random_uuid(),
    'payment_received',
    'Payment received — {{jobNumber}}',
    '<p>Dear {{customerName}},</p><p>Thank you very much for your payment well received.</p><p>Please find attached your amended confirmation invoice.</p><p><strong>PAYMENT SCHEDULE</strong></p><p>Amount received: <strong>{{receivedAmount}}</strong> – Received, thank you</p><p>Final amount due {{finalDueDate}}: <strong>{{outstandingAmount}}</strong></p><p>Hope you have a wonderful day.</p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',
    1, true, true, now(), now()
  )
on conflict (key) do nothing;

-- 6. Mirror client-facing wording to the sales team's real emails (approved
--    2026-07-17: "change the text of the emails to be 95% similar"). This
--    intentionally overwrites any prior body for these keys.
update public.templates set
  body_html = '<p>Dear {{customerName}},</p><p>Thank you for your most valued {{supplierName}} enquiry.</p><p><strong>AVAILABILITY</strong></p><p>On the {{direction}} departure, {{departureDate}}, we can still assist you with your selected suite.</p><p><strong>QUOTATION</strong> <em>(This quotation is exclusive to SA Rail – a division of Luxus Travel &amp; Tours)</em></p>{{quoteSummaryTable}}<p>The full quotation is also attached to this email.</p><p><strong>RESERVATION PROCEDURE</strong></p><p>Should you wish to proceed with a:</p><p><strong>Waitlist</strong> – kindly provide me with the first names, surnames &amp; dates of birth of all the guests travelling.</p><p><strong>Provisional Reservation</strong> – kindly provide me with the first names, surnames &amp; ID/Passport numbers of all the guests travelling. A provisional reservation can only be held for 72 hours.</p><p><strong>Definite Reservation</strong> – please complete and return the attached reservation form by email together with ID copies of all passengers travelling.</p><p><strong>BOOKING STATUS</strong></p><p>The booking status will only change to confirmed once your deposit has been received. Reservation will only be guaranteed once full payment has been received.</p><p><strong>PAYMENT TERMS</strong></p><p>A 25% non-refundable deposit is required within 72 hours of receiving your confirmation invoice to secure your reservation. The final payment is due 60 days before your departure. Should the reservation be made within 60 days before the departure period, the full amount will be due 48 hours after invoicing.</p><p>**Kindly ensure that payments are received on due dates to avoid cancellation.</p><p><strong>PAYMENT METHOD</strong></p><p>Payment can either be made by Electronic transfer (EFT) or Credit Card. We accept Mastercard and Visa card payments via PayGate, a secure online site. There is a 2.6% surcharge to partially cover the high credit card fees. Kindly request the payment link from your reservation consultant to use this facility.</p><p><strong>TICKETS &amp; VOUCHERS</strong></p><p>Once full payment is received, all your travel documents will be issued, and your vouchers will be sent to you electronically. Your actual train tickets will be provided at the station on the day of departure.</p><p><strong>CHANGES / CANCELLATION</strong></p><p>Our standard travel terms &amp; conditions apply to all reservations.</p><p><strong>INSURANCE</strong></p><p>It is highly recommended that clients obtain comprehensive travel insurance coverage that includes protection against trip cancellation penalties.</p><p><strong>CLIENT PROTECTION</strong></p><p>We are proud members of SATSA (membership number 2485) and insured through SATIB. As part of the Southern Africa Tourism Services Association, we are dedicated to raising tourism standards in South Africa.</p><p><strong>ADDITIONAL TRAVEL ARRANGEMENTS</strong></p><p>If you require assistance with any additional travel arrangements, such as flights, car rentals, accommodations, tours, or excursions, please do not hesitate to contact me. I am here to ensure that your travel experience is seamless and enjoyable.</p><p>Thank you for your enquiry. If you need any additional information or assistance, please don''t hesitate to reach out. I look forward to your response.</p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',
  version = version + 1,
  updated_at = now()
where key = 'quote_email';

update public.templates set
  subject = 'Confirmation Invoice {{invoiceNumber}} — {{jobNumber}}',
  body_html = '<p>Dear {{customerName}},</p><p>Thank you for your reservation request.</p><p><strong>GUEST DETAILS</strong></p><p>Please ensure that all details match those on the ID or passport.</p><p><strong>RESERVATION/ITINERARY DETAILS</strong></p><p>Provisional reservations are secured for the travel services listed on your confirmation invoice. Please ensure all details are correct, as travel arrangements will be issued accordingly and change fees may apply.</p><p><strong>PLEASE FIND ATTACHED</strong></p><p>Your confirmation invoice with bank details.</p><p><strong>PAYMENT SCHEDULE</strong></p><p>Deposit due Now: <strong>{{depositAmount}}</strong></p><p>Final amount due {{finalDueDate}}: <strong>{{finalAmount}}</strong></p><p><strong>PAYMENT TERMS</strong></p><p>A non-refundable deposit of {{depositPercentage}}% is required within 72 hours of receiving your confirmation invoice to secure your reservation. The final payment must be made 60 days prior to departure. If the reservation is made within 60 days of the departure date, the full amount will be due 48 hours after invoicing.</p><p>**Kindly ensure that payments are received on due dates to avoid automatic cancellation.</p><p><strong>BANK DETAILS FOR ELECTRONIC PAYMENTS</strong></p>{{bankingDetails}}<p><strong>REF NO: {{invoiceNumber}}</strong></p><p>Please note: the amounts transferred should be exclusive of all bank charges.</p><p><strong>CREDIT CARD PAYMENTS</strong></p><p>We accept MasterCard and Visa payments via PayGate, a secure online platform. Please request the payment link from your reservation consultant to use this service. Note: there will be a 2.6% surcharge on Credit Card payments.</p><p><strong>BOOKING STATUS</strong></p><p>Your booking status will be confirmed only after we receive your deposit. The reservation will be secured once full payment is made.</p><p><strong>TICKETS &amp; VOUCHERS</strong></p><p>After full payment is received, all travel documents will be issued, and vouchers will be sent to you electronically. Your train tickets will be provided during check-in.</p><p><strong>ADDITIONAL TRAVEL ARRANGEMENTS</strong></p><p>If you require assistance with any additional travel arrangements, such as flights, car rentals, accommodations, tours, or excursions, please do not hesitate to contact me.</p><p>I thank you for your most valued reservation. Please do not hesitate to contact me should you require further information.</p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',
  version = version + 1,
  updated_at = now()
where key = 'deposit_request';

update public.templates set
  body_html = '<p>Dear {{customerName}},</p><p>Thank you for your most valued reservation.</p><p>Attached you will find the following documents:</p><ul><li>Your travel vouchers with contact details – South Africa is voucherless. The reference found on your itinerary is all you need to confirm payment for the services booked for you. Each relevant reference number needs to be given to each service provider when using their respective service. All passengers will be required to provide identification (ID or passport) when checking in to any accommodation establishment.</li><li>Your itinerary</li></ul><p>Please keep a copy of the travel vouchers with you for reference purposes together with your South African IDs or Passports.</p><p>Your train tickets will be given to you at the lounge when checking in for your departure.</p><p>Please read through all the documents to see if everything is correct and advise if any changes must be made.</p><p><strong>IMPORTANT INFORMATION BEFORE YOU TRAVEL</strong></p><p>We recommend that you do not make use of Uber services at either departure or arrival stations. Rather make use of a private transfer or the Gautrain.</p><p>As the train runs on a shared railway line, there may be occasions when it stops for a period of time. If there are any significant delays, your train manager will inform you and the necessary arrangements will be made. The train and Luxus Travel &amp; Tours cannot be held responsible or liable for any delays or changes in tour arrangements that may be caused by natural or other factors beyond our control. We strongly advise against same-day air travel on departure or arrival days due to possible train delays.</p><p>We urge all our clients to take out adequate travel insurance.</p><p>I wish you a safe and pleasant journey on the {{direction}} departure of {{departureDate}}, and please do not hesitate to contact me if you require any further assistance.</p><p>Warm regards,<br/>{{consultantName}}<br/>Luxus Travel &amp; Tours</p>',
  version = version + 1,
  updated_at = now()
where key = 'voucher_email';
