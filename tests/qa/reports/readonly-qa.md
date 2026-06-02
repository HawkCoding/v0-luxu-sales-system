# Read-only Role — End-to-End QA Findings (Phase 33 UAT)

- **Run date:** 2026-06-02T18:55:31.538Z
- **Branch:** feat/manager-uat-fixes
- **Commit SHA:** 2aca78e
- **Browser:** Chromium (Playwright `Desktop Chrome`)
- **Acting role:** Read-only — douwlien@luxustravel.co.za (clearance_level=readonly)
- **Base URL:** http://localhost:3000 (local dev + local Supabase)

**Result:** 10 PASS · 0 FAIL · 0 BLOCKED (of 10 criteria)

## Per-criterion results

| # | Title | Result | Evidence |
|---|-------|--------|----------|
| 1 | Can view allowed pages | PASS | Rendered view-only: dashboard, pipeline, enquiries, customers, suppliers, packages, quotes, payments, documents, correspondence; Manager+ surfaces correctly hidden from read-only nav — Reporting link=false, Audit link=false (both expected false); 10/10 read-only pages render view-only; Reporting/Audit correctly excluded from the nav; `screenshots/r1-dashboard.png` |
| 2 | Cannot create/edit/delete customers | PASS | POST /api/customers → HTTP 403 ✓ blocked; PATCH /api/customers/[id] → HTTP 403 ✓ blocked; UI create control exposed=false; Customer create/edit blocked at the API; no enabled UI mutation control |
| 3 | Cannot mutate bookings/jobs | PASS | PATCH /api/jobs/[id] (claim) → HTTP 403 ✓ blocked; PATCH /api/jobs/[id] (stage move) → HTTP 403 ✓ blocked; UI controls exposed — Claim=false, Start Quote=false, Next=false; Booking/job mutations blocked at the API; no enabled UI control; `screenshots/r3-job.png` |
| 4 | Cannot mutate quotes | PASS | POST /api/jobs/[id]/start-quote → HTTP 403 ✓ blocked; POST /api/quotes/[id]/pdf → HTTP 403 ✓ blocked; Quote create/generate blocked at the API |
| 5 | Cannot record payments | PASS | POST /api/payments → HTTP 403 ✓ blocked; UI Record Payment control exposed=false; Payment recording blocked at the API; no enabled UI control |
| 6 | Cannot mutate suppliers/rates/packages | PASS | POST /api/suppliers → HTTP 403 ✓ blocked; PATCH /api/suppliers/[slug] → HTTP 403 ✓ blocked; POST /api/rate-types → HTTP 403 ✓ blocked; Supplier/rate-type mutations blocked at the API |
| 7 | Cannot manage settings | PASS | PATCH /api/settings/company → HTTP 403 ✓ blocked; PATCH /api/settings/deposit → HTTP 403 ✓ blocked; PATCH /api/templates → HTTP 403 ✓ blocked; Sidebar Settings link visible=false; Settings mutations blocked at the API; Settings hidden from read-only nav |
| 8 | Cannot export reports | PASS | app_settings.read_only_exports_allowed=false; Export endpoint → HTTP 403; UI CSV link visible=false; GET /api/reports/.../export → HTTP 403 ✓ blocked; Export blocked (403) with exports-disabled setting; no UI export control |
| 9 | Cannot send any email | PASS | POST /api/correspondence (send) → HTTP 403 ✓ blocked; Email send blocked at the API |
| 10 | Cannot manage users/error log/backup | PASS | GET /api/users → HTTP 403 ✓ blocked; POST /api/error-logs/[id]/resolve → HTTP 403 ✓ blocked; POST /api/backups → HTTP 403 ✓ blocked; User-management, error-log resolve, and backup all blocked at the API |

## Permission mismatches (UI exposes an action the API rejects)

_None found — every mutation control is hidden/disabled for read-only, consistent with the API 403s._

## Findings

_No findings recorded._
## Improvement recommendations (prioritised)

_None._

## Coverage map — todo.md Phase 33 Read-only UAT

| todo.md bullet | Criterion | Demonstrably passing? |
|----------------|-----------|------------------------|
| Can view allowed pages | 1 | ✅ Yes |
| Cannot create/edit/delete customers | 2 | ✅ Yes |
| Cannot mutate bookings/jobs | 3 | ✅ Yes |
| Cannot mutate quotes | 4 | ✅ Yes |
| Cannot record payments | 5 | ✅ Yes |
| Cannot mutate suppliers/rates/packages | 6 | ✅ Yes |
| Cannot manage settings | 7 | ✅ Yes |
| Cannot export reports | 8 | ✅ Yes |
| Cannot send any email | 9 | ✅ Yes |
| Cannot manage users/error log/backup | 10 | ✅ Yes |

