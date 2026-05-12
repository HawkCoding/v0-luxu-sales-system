-- =============================================================================
-- PRODUCTION TEST-DATA CLEANUP
-- =============================================================================
-- Removes all business and reference data, preserving staff user accounts
-- (auth.users + public.profiles).
--
-- HOW TO RUN:
--   1. Take a Supabase backup first (dashboard → Backups → Create backup)
--   2. Open Supabase Studio → SQL Editor → New query
--   3. Paste this file, read through it, then click Run
--   4. If any statement fails the whole transaction rolls back automatically
--
-- PRESERVED:  auth.users, public.profiles
-- REMOVED:    everything else (bookings, customers, suppliers, packages, etc.)
--
-- WHY A SINGLE TRUNCATE:
--   PostgreSQL enforces FK constraints structurally on TRUNCATE, not just by
--   row count. Even an empty referencing table blocks a separate TRUNCATE on
--   the referenced table. Listing all tables in one statement lets Postgres
--   resolve the dependency order itself. CASCADE clears any child tables not
--   listed explicitly (quotes, invoices, payments, documents, etc.).
-- =============================================================================

BEGIN;

TRUNCATE TABLE
  public.bookings,
  public.customers,
  public.audit_logs,
  public.audit_log_archives,
  public.report_snapshots,
  public.pipeline_history,
  public.inbound_email_messages,
  public.inbound_email_sync_runs,
  public.inbound_email_rules,
  public.inbound_email_accounts,
  public.rate_cards,
  public.supplier_seasonal_prices,
  public.supplier_seasonal_periods,
  public.supplier_pricing_options,
  public.supplier_emails,
  public.hotel_offers,
  public.package_leg_routes,
  public.package_legs,
  public.suite_types,
  public.routes,
  public.packages,
  public.locations,
  public.suppliers,
  public.app_settings,
  public.voucher_template,
  public.templates
CASCADE;

COMMIT;

-- =============================================================================
-- VERIFICATION QUERIES — run these after the script to confirm the cleanup
-- =============================================================================
-- SELECT 'bookings'   AS tbl, COUNT(*) FROM public.bookings
-- UNION ALL SELECT 'customers',  COUNT(*) FROM public.customers
-- UNION ALL SELECT 'suppliers',  COUNT(*) FROM public.suppliers
-- UNION ALL SELECT 'packages',   COUNT(*) FROM public.packages
-- UNION ALL SELECT 'profiles',   COUNT(*) FROM public.profiles;
--
-- Expected: 0 for the first four rows, original staff count for profiles.
-- =============================================================================
