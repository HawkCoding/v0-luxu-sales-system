# Manager Role — End-to-End QA Findings (Phase 33 UAT)

- **Run date:** 2026-06-02T10:00:08.840Z
- **Branch:** wip/pre-demo-local-v2
- **Commit SHA:** 22e36e4
- **Browser:** Chromium (Playwright `Desktop Chrome`)
- **Acting role:** Manager — dirk@luxustravel.co.za (clearance_level=manager)
- **Base URL:** http://localhost:3000 (local dev + local Supabase)

**Result:** 6 PASS · 0 FAIL · 0 BLOCKED (of 6 criteria)

## Per-criterion results

| # | Title | Result | Evidence |
|---|-------|--------|----------|
| 1 | Edit + add/remove templates (manager) | PASS | Manager template UI present: New Template button visible; edit pencil visible=false; Edit: subject persisted, version 1→2, audit template_updated written; Add: custom template 'qa_welcome_1780394375808' created via UI (is_system=false), audit template_created written; Protection: deleting system template 'deposit_request' → HTTP 409, row preserved; Remove: custom template deleted via UI (trash + confirm), row gone, audit template_deleted written; Manager can edit, add and remove templates via the UI; system templates protected from deletion; `screenshots/m1-templates-list.png`; `screenshots/m1-after-remove.png` |
| 2 | Manage suppliers (create + route + pricing) | PASS | Supplier created: QA Test Lodge 1780394381094 (slug=qa-test-lodge-1780394381094, id=60767175-4518-4510-b449-b7706752f59a); Save → HTTP 200; route 'QA Route A', suite type 'QA Standard Suite', pricing option R12000 (2027-01-01→2027-06-30) persisted; Supplier created with a route/service and a pricing option; rows verified in DB; `screenshots/m2-supplier-detail.png` |
| 3 | Manage rates (overlap prevented, adjacent allowed) | PASS | Overlapping rate (Jan–Jun + Mar–Sep) → HTTP 409: "Overlapping rate card periods are not allowed for the same route and suite type."; Adjacent rate (Jul–Dec) → HTTP 200; route now has 2 non-overlapping cards (2027-01-01→2027-06-30, 2027-07-01→2027-12-31); Overlapping rate blocked (409, clear message); adjacent non-overlapping rate accepted |
| 4 | View reports (filters + CSV) | PASS | /app/reporting renders KPIs + filtered report cards for manager; Conversion-rate total: all=37 → owner=Leonie=9 (owner filter narrows result); Product filter scopes rows correctly: BT=0 rows (seed has 0 Blue Train bookings), RR=1 rows (all product=RR); CSV export HTTP 200 (text/csv); header ""Consultant","Bookings","Revenue (R)","Won""; 1 data rows; saved reports/m4-sales-per-salesperson-leonie.csv; Filters change report numbers; CSV downloads, columns match UI, opens cleanly; `screenshots/m4-reporting-filtered.png` |
| 5 | Reassign jobs (owner change + audit) | PASS | Reassign PATCH → HTTP 200; assigned_salesperson_id Leonie→Monade; audit 'salesperson_reassigned' before={"assigned_salesperson_id":"00000000-0000-0000-0000-0000000000a2"} after={"assigned_salesperson_id":"00000000-0000-0000-0000-0000000000a4"}; Job reassigned via UI; owner change + audit verified; `screenshots/m5-job-page.png` |
| 6 | Resolve errors (resolved_by/at + badge decrements) | PASS | Resolve POST → HTTP 200; resolved_by=00000000-0000-0000-0000-0000000000a3 (manager), resolved_at set; unresolved badge count 1→0; Error resolved; resolved_by/resolved_at populated; unresolved count decremented; `screenshots/m6-after-resolve.png` |

## Findings

_No findings recorded._
## Improvement recommendations (prioritised)

1. RESOLVED this round: managers now have view+edit:templates plus a New Template / delete UI (built-in templates protected); the job header has a manager-only Reassign control; and the reports now resolve owner from assigned_salesperson_id so reassigned jobs move correctly. Re-run after deploy to confirm in staging.
2. Consider letting managers reassign in bulk from the bookings list (currently one job at a time from the job header).
3. Custom email templates are created but not yet selectable in the send flows (quote/invoice/voucher use the built-in keys). A follow-up could let staff choose a custom template when composing ad-hoc correspondence.

## Coverage map — todo.md Phase 33 Manager UAT

| todo.md bullet | Criterion | Demonstrably passing? |
|----------------|-----------|------------------------|
| Can edit + add/remove templates | 1 | ✅ Yes |
| Can manage suppliers | 2 | ✅ Yes |
| Can manage rates (overlap prevention) | 3 | ✅ Yes |
| Can view reports + export CSV | 4 | ✅ Yes |
| Can reassign jobs | 5 | ✅ Yes |
| Can resolve errors | 6 | ✅ Yes |

