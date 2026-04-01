-- Local dev: wipe customers, bookings, and related audit rows.
-- booking_* child tables CASCADE from bookings; customer_linked_accounts CASCADE from customers.
-- Run: npx supabase db query --local -f supabase/scripts/clean-customers-bookings-local.sql

DO $body$
BEGIN
  DELETE FROM public.audit_logs
  WHERE entity_type IN ('Booking', 'Customer', 'Payment');

  DELETE FROM public.bookings;

  DELETE FROM public.customers;

  PERFORM setval('public.booking_number_seq', 1, false);
END;
$body$;
