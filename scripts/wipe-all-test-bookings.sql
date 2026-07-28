-- ============================================================================
-- WIPE ALL BOOKINGS, CUSTOMERS, AND RELATED DATA — DESTRUCTIVE, IRREVERSIBLE
-- ============================================================================
-- Run in the Supabase SQL Editor against PRODUCTION only after confirming
-- every row in `bookings` is test data. This deletes:
--   - all bookings (and, via ON DELETE CASCADE: quotes, quote_items, payments,
--     invoices, deposit_invoices, documents, correspondences, itineraries,
--     travellers, booking_suites, pipeline_history, vouchers/service_blocks,
--     attachments, transport requests, reservation_details, booking_services)
--   - all customers
--   - resets booking number sequences back to zero
--
-- NOTE: storage.objects (the actual PDF/attachment files) CANNOT be deleted
-- from the SQL Editor — Supabase blocks direct DELETE on that table with a
-- protect_delete() trigger ("Use the Storage API instead"). STEP A below
-- lists the paths; delete those via the Dashboard Storage UI or the Storage
-- API (supabase.storage.from(bucket).remove([...])) as a separate action
-- AFTER the DB rows are gone.
--
-- Take a fresh backup (or run `pnpm db:backup` equivalent) before executing.
-- Run STEP 0 first and eyeball the counts before proceeding.
-- ============================================================================

-- STEP 0: Preview — sanity-check what's about to be deleted
select
  (select count(*) from public.bookings)  as bookings_count,
  (select count(*) from public.customers) as customers_count,
  (select count(*) from public.documents) as documents_count,
  (select count(*) from public.payments)  as payments_count,
  (select count(*) from public.quotes)    as quotes_count;

-- Review the numbers above. If they look wrong (unexpectedly high, or you
-- recognize real customer names in a spot-check), STOP and do not proceed.
-- select id, first_name, last_name, email from public.customers limit 50;

-- STEP A: run this SEPARATELY and export/copy the results before you delete
-- anything below — this is your list of files to remove via Storage
-- afterwards (Dashboard: Storage → bucket → navigate to path → delete).
select
  split_part(storage_path, '/', 1)                                   as bucket_id,
  substr(storage_path, length(split_part(storage_path, '/', 1)) + 2)  as object_name
from public.documents
where storage_path is not null
order by bucket_id, object_name;

-- ============================================================================
-- STEP 1+: Everything below runs as one transaction. Nothing is committed
-- until COMMIT runs at the end — if anything looks wrong, run ROLLBACK instead.
-- Select this whole block (begin; through the final select) and run it ONCE.
-- ============================================================================
begin;

-- STEP 1: delete all bookings — cascades to every booking-child table
-- (quotes, quote_items, payments, invoices, deposit_invoices, documents,
-- correspondences, itineraries, travellers, booking_suites, pipeline_history,
-- vouchers/service_blocks, attachments, transport requests,
-- reservation_details, booking_services)
delete from public.bookings;

-- STEP 2: delete all customers (safe now — no bookings reference them)
delete from public.customers;

-- STEP 3: reset booking number sequences so new bookings start fresh
truncate table public.booking_number_sequences;

-- STEP 4: verify — all should read 0
select
  (select count(*) from public.bookings)  as bookings_count,
  (select count(*) from public.customers) as customers_count,
  (select count(*) from public.documents) as documents_count,
  (select count(*) from public.payments)  as payments_count,
  (select count(*) from public.quotes)    as quotes_count;

-- If STEP 4 counts all look right: commit;
-- If anything looks wrong:              rollback;
