# Architecture Decision Records

## ADR-001: Company Scoping — Single-Company Permanently

**Date:** 2026-05-13  
**Status:** Decided

### Context

The original MVP spec considered multi-agency / multi-company support as a potential
requirement — hidden tenant isolation via `company_id` across all domain tables.

A full audit was performed covering all 42 database tables, 35+ API routes, RLS
policies, settings storage, and the profiles/user model.

**Audit finding:** Zero `company_id`, `tenant_id`, or `organization_id` columns exist
anywhere in the schema. All RLS policies are globally permissive for authenticated
users (role-gated writes, open reads). The system is purely single-company today.

### Decision

**Luxus will remain permanently single-company. No multi-tenancy infrastructure will
be added.**

The business requirement was re-evaluated: Luxus serves one company only. The original
multi-agency intent has been dropped.

### Consequences

**What this means going forward:**

- Do NOT add `company_id`, `tenant_id`, or `organization_id` to any table.
- Do NOT add company-resolution helpers or middleware.
- Do NOT add company-switching UI.
- `app_settings` remains a flat global key/value table — this is correct.
- `profiles.clearance_level` (`admin` / `manager` / `consultant` / `readonly`) is the
  sole access-control axis.
- All existing RLS policies (role-based, not tenant-aware) are correct and should be
  maintained as-is.

### What Multi-Tenancy Would Require (Future Reference)

If this decision is ever reversed, the full scope of work is:

1. Create a `companies` table (id, name, slug, created_at)
2. Add `company_id` to `profiles` (user → company mapping)
3. Backfill all domain tables with a default `company_id`
4. Replace all RLS policies with tenant-aware variants
5. Add a `getCompanyId(supabase, userId)` helper in `lib/api/`
6. Update `requireRole()` in `lib/api/auth.ts` to also return `companyId`
7. Update all 35+ API routes to filter by `companyId`
8. Migrate `app_settings` → `company_settings` with `company_id` PK
9. Migrate existing `app_settings` rows to the default company

This is a large, breaking change that must be done completely — partial tenant logic
is worse than no tenant logic.

**Tables that would need `company_id` (for reference):**  
High-priority: `bookings`, `customers`, `quotes`, `invoices`, `payments`, `suppliers`,
`templates`, `audit_logs`, `app_settings` (as `company_settings`).  
Medium-priority: `routes`, `packages`, `rate_cards`, `suite_types`, `locations`,
`correspondences`, `documents`, `inbound_email_accounts`, `inbound_email_rules`,
`voucher_template`, `report_snapshots`.
