-- ============================================================
-- Luxus Sales System — Demo Mode Overlay Seed
-- Re-runnable: drops and re-inserts the DEMO booking + customer.
-- Layered on top of the standard seed.sql (run after `db:reset`).
-- Lands a known-good booking at the `accepted` stage with one
-- sent-and-accepted quote so the presenter can demo:
--   deposit-invoice -> payment -> final-invoice -> voucher
-- without walking the whole flow first.
-- ============================================================

-- All IDs use the dedicated DEMO range (UUIDs ending d-e-m-o) so
-- they never collide with the showcase seed in seed.sql.

-- ------------------------------------------------------------
-- Clean up prior demo state (idempotent)
-- ------------------------------------------------------------
delete from public.quote_line_items where quote_id = '00000000-0000-0000-0000-00000000dem0';
delete from public.quotes where booking_id = '00000000-0000-0000-0000-00000000d3m0';
delete from public.payments where booking_id = '00000000-0000-0000-0000-00000000d3m0';
delete from public.invoices where booking_id = '00000000-0000-0000-0000-00000000d3m0';
delete from public.correspondences where booking_id = '00000000-0000-0000-0000-00000000d3m0';
delete from public.documents where booking_id = '00000000-0000-0000-0000-00000000d3m0';
delete from public.booking_notes where booking_id = '00000000-0000-0000-0000-00000000d3m0';
delete from public.bookings where id = '00000000-0000-0000-0000-00000000d3m0';
delete from public.customers where id = '00000000-0000-0000-0000-00000000cusd';

-- ------------------------------------------------------------
-- Demo customer
-- ------------------------------------------------------------
insert into public.customers (
  id, title, first_name, last_name, email, phone, country, province,
  notes, vip_status, preferences, communication_preferences,
  is_repeat_client, created_at, updated_at
) values (
  '00000000-0000-0000-0000-00000000cusd',
  'Mr', 'Demo', 'Presenter', 'demo.presenter@luxustravel.co.za',
  '+27820000000', 'South Africa', 'Gauteng',
  'Synthetic demo customer for sales demonstrations. Safe to delete.',
  true,
  'Royal Double Suite. Champagne on arrival.',
  'Email preferred for written confirmations.',
  false,
  now(), now()
);

-- ------------------------------------------------------------
-- Demo booking at "accepted" stage
-- Reuses Rovos Rail (supplier) + Cape Town Classic (package)
-- from the base seed.sql so package legs/routes resolve.
-- ------------------------------------------------------------
insert into public.bookings (
  id, booking_number, customer_id, package_id, route_id,
  purpose, source, stage, consultant, owner_user_id, assigned_salesperson_id,
  departure_date, duration_nights, no_of_adults, no_of_children, no_of_suites,
  hotel_phase, hotel_supplier_id, extend_stay, extra_nights,
  additional_services, additional_services_details,
  terms_accepted, deposit_paid, invoice_balance,
  quote_sent_at, accepted_at,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-00000000d3m0',
  'DEMO-2026-0001',
  '00000000-0000-0000-0000-00000000cusd',
  '00000000-0000-0000-0000-000000003001', -- cape-town-classic
  '00000000-0000-0000-0000-000000004001', -- existing route from seed
  'reservation', 'web_form', 'accepted', 'CDJ',
  '00000000-0000-0000-0000-0000000000a1', -- carmen (admin)
  '00000000-0000-0000-0000-0000000000a1',
  current_date + interval '90 days',
  3, 2, 0, 1,
  'pre', '00000000-0000-0000-0000-000000002002', -- irene-country-lodge
  false, null, false, null,
  true, false, 142600.00,
  now() - interval '5 days',
  now() - interval '1 day',
  now() - interval '7 days',
  now()
);

-- ------------------------------------------------------------
-- Demo quote (Q1, accepted)
-- ------------------------------------------------------------
insert into public.quotes (
  id, booking_id, itinerary_id,
  quote_number, status, validity_until,
  subtotal, vat, total,
  last_sent_at, created_at, updated_at
) values (
  '00000000-0000-0000-0000-00000000dem0',
  '00000000-0000-0000-0000-00000000d3m0',
  null,
  'DEMO-2026-0001-Q1',
  'accepted',
  current_date + interval '9 days',
  124000.00, 18600.00, 142600.00,
  now() - interval '5 days',
  now() - interval '5 days',
  now() - interval '1 day'
);

insert into public.quote_line_items (
  id, quote_id, description, qty, unit_price, total, sort_order, created_at
) values (
  '00000000-0000-0000-0000-00000000lin1',
  '00000000-0000-0000-0000-00000000dem0',
  'Royal Double Suite (2 pax) - Cape Town Classic',
  1, 124000.00, 124000.00, 1, now() - interval '5 days'
);
