-- Full-payment invoice kind: when a booking is made inside 60 days of
-- departure (or the salesperson opts in), the client owes one full amount
-- instead of a deposit + final split. Adds a third invoice kind that
-- satisfies both the deposit and final pipeline gates, plus its own
-- system email template.

-- 1. Allow kind = 'full' alongside the existing 'deposit' / 'final'.
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_kind_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_kind_check CHECK (kind IN ('deposit', 'final', 'full'));

-- 2. Only one active (draft/sent) full-payment invoice per booking, mirroring
--    the existing deposit/final partial unique indexes.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_active_full
  ON invoices (booking_id)
  WHERE kind = 'full' AND status IN ('draft', 'sent');

-- 3. System template for the full-payment confirmation invoice email. Mirrors
--    deposit_request wording but with a single payment line (no split) and
--    the "full amount due 48 hours after invoicing" terms for bookings made
--    within 60 days of departure.
insert into public.templates (id, key, subject, body_html, version, active, is_system, created_at, updated_at)
values
  (
    gen_random_uuid(),
    'full_payment_request',
    'Confirmation Invoice {{invoiceNumber}} — {{jobNumber}}',
    '<p>Dear {{customerName}},</p><p>Thank you for your reservation request.</p><p><strong>GUEST DETAILS</strong></p><p>Please ensure that all details match those on the ID or passport.</p><p><strong>RESERVATION/ITINERARY DETAILS</strong></p><p>Provisional reservations are secured for the travel services listed on your confirmation invoice. Please ensure all details are correct, as travel arrangements will be issued accordingly and change fees may apply.</p><p><strong>PLEASE FIND ATTACHED</strong></p><p>Your confirmation invoice with bank details.</p><p><strong>PAYMENT SCHEDULE</strong></p><p>Full amount due {{dueDate}}: <strong>{{amountDue}}</strong></p><p><strong>PAYMENT TERMS</strong></p><p>As this reservation falls within 60 days of departure, full payment is required within 48 hours of receiving your confirmation invoice to secure your reservation.</p><p>**Kindly ensure that payment is received on the due date to avoid automatic cancellation.</p><p><strong>BANK DETAILS FOR ELECTRONIC PAYMENTS</strong></p>{{bankingDetails}}<p><strong>REF NO: {{invoiceNumber}}</strong></p><p>Please note: the amount transferred should be exclusive of all bank charges.</p><p><strong>CREDIT CARD PAYMENTS</strong></p><p>We accept MasterCard and Visa payments via PayGate, a secure online platform. Please request the payment link from your reservation consultant to use this service. Note: there will be a 2.6% surcharge on Credit Card payments.</p><p><strong>BOOKING STATUS</strong></p><p>Your booking status will be confirmed only after we receive your full payment.</p><p><strong>TICKETS &amp; VOUCHERS</strong></p><p>After full payment is received, all travel documents will be issued, and vouchers will be sent to you electronically. Your train tickets will be provided during check-in.</p><p><strong>ADDITIONAL TRAVEL ARRANGEMENTS</strong></p><p>If you require assistance with any additional travel arrangements, such as flights, car rentals, accommodations, tours, or excursions, please do not hesitate to contact me.</p><p>I thank you for your most valued reservation. Please do not hesitate to contact me should you require further information.</p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',
    1, true, true, now(), now()
  )
on conflict (key) do nothing;
