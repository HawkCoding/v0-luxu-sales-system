# Luxus Sales System — Final Release Handoff

Generated as the closing artifact of the compiled MVP plan at
`C:\Users\Hancke\.claude\plans\please-write-me-a-compiled-lamport.md` (Phase 7).
This doc accompanies `uat_checklist.md` and the ticked `todo.md`.

---

## 1. What shipped this cycle

One bullet per parent-plan phase, naming the headline change and the migrations / routes /
settings keys it introduced.

- **Phase 1 — Error Logging foundation.**
  - Migration: `supabase/migrations/20260527000000_error_logs.sql` —
    `error_logs (severity, source, message, details, resolved, resolved_by, resolved_at)`.
  - Helper: `lib/error-log.ts` (`logError`, service-role client, swallow-on-failure).
  - APIs: `GET /api/error-logs`, `POST /api/error-logs/[id]/resolve` — Manager/Admin.
  - UI: `app/app/settings/error-log/page.tsx` + unresolved badge in settings nav.
  - Dashboard: "Unresolved errors" StatCard on `app/app/page.tsx`.
  - `console.error` sites wired through `logError` (quote PDF, inbound sync, invoice/voucher
    generation, import warnings, reminder/follow-up skips).

- **Phase 2 — Quote Follow-Up Worker.**
  - Migration: `supabase/migrations/20260528100000_quote_follow_ups.sql` —
    `quote_follow_ups` table + `quotes.follow_ups_disabled` column.
  - Seeded settings: `quote_follow_up_enabled`, `quote_follow_up_cadence`,
    `quote_follow_up_template`.
  - Worker: `lib/quotes/follow-up-worker.ts` (modeled on `lib/invoices/payment-reminders-worker.ts`).
  - Cron route: `app/api/cron/quote-follow-ups/route.ts` (Bearer `CRON_SECRET`).
  - `vercel.json` updated with `quote-follow-ups` + the previously-missing `payment-reminders`
    cron entries.
  - Settings UI: cadence / template / enabled toggle under Settings → Quote and Sales.

- **Phase 3 — Backup full restore + complete snapshot.**
  - Migration: `supabase/migrations/20260528110000_backup_restore_function.sql` — Postgres
    `restore_backup_snapshot(jsonb)` (`SECURITY DEFINER`, flips
    `session_replication_role = replica`, truncates + reinserts atomically, resets sequences).
  - `lib/backup/create-backup.ts` `TABLES_TO_SNAPSHOT` expanded to cover all data tables
    (vouchers, voucher service blocks, documents, booking notes, outcome reasons, rate types,
    correspondences, payment reminders, quote follow-ups, pipeline history,
    customer-linked-accounts, supplier email labels, booking package selections,
    salesperson_credentials, error_logs, etc.) excluding `backup_records` itself.
  - `app/api/backups/restore/route.ts` — full destructive restore, Admin-only, typed-token
    confirmation, audit `backup_restored`, `logError('Critical','backup-restore',…)` on failure.
  - `app/api/cron/backup/route.ts` — daily backup worker, Bearer `CRON_SECRET`.
  - UI: `components/backup-settings.tsx` restore dialog requires typed backup id.

- **Phase 4 — Reports, filters & exports.**
  - Pure helpers: `lib/reports/sales-per-salesperson.ts`, `conversion-rate.ts`,
    `revenue-per-product.ts`, `outstanding-payments.ts`, `enquiries-by-source.ts`, each
    unit-tested in a co-located `.test.ts`.
  - Shared CSV builder: `lib/reports/to-csv.ts`.
  - Endpoints under `app/api/reports/[report]/route.ts` and
    `app/api/reports/[report]/export/route.ts` — gated; read-only blocked when
    `read_only_exports_allowed='false'`.
  - Client: `app/app/reporting/page.tsx` writes URL query-param filters and fetches via SWR.
  - `lib/role-context.tsx` `export:reporting` aligned with the server-side gate.

- **Phase 5 — Refund auto-calc.**
  - Seeded setting: `deposit_refundable` (default `false`).
  - Helper: `lib/invoices/calculate-refund.ts` — fee = deposit when non-refundable, refund
    floored at zero.
  - `app/api/jobs/[id]/cancel/route.ts` uses the helper, honors consultant override,
    writes a negative `payments` row (`payment_kind='refund'`), recalculates invoice balance,
    audits before/after with `cancellation_fee` and `refund_amount`.

- **Phase 6 — Test suite, coverage & E2E.**
  - New E2E scenarios under `tests/e2e/` (Vitest, mocked Supabase/email/storage):
    BT enquiry → quote, RR enquiry → voucher, cancel + refund.
  - Coverage gaps surfaced by `pnpm test:coverage` closed for critical-workflow files.

- **Phase 7 — UAT checklist + release-readiness (this phase).**
  - `.cursor/agent-handoffs/uat_checklist.md` — per-role manual scripts (Consultant /
    Manager / Admin / Read-only).
  - `.cursor/agent-handoffs/final-release-handoff.md` — this file.
  - `todo.md` Phase 35 ticks for the items verified in this session.
  - `lib/version.ts` bumped once at end of session.

---

## 2. Deferred-with-reason

Anything the parent plan or this phase explicitly chose not to ship.

- **Report PDF export.** Parent-plan Phase 4 only commits to CSV; PDF deferred unless the
  existing PDF tooling renders tabular data cleanly without bespoke layout work. CSV covers
  the manager-side reporting requirement; PDF can be added later from the same pure helpers.
- **Real-prod backup/restore drill.** Round-trip tests cover local Supabase only — never
  prod. Production backup/restore drills remain a human task in a staging or sandbox env
  (Phase 35 manual smoke).
- **Phase 33 UAT runthrough.** Intentionally left unchecked; humans run `uat_checklist.md`
  and mirror the ticks back into `todo.md`.
- **Phase 35 manual smoke / email sync / PDF / file upload / handoff feedback.** Require a
  live local environment plus a tester; not automatable in this session.

---

## 3. Where to look

Quick index for the next agent or operator.

| Subsystem | Primary code | Tests | Settings keys |
|---|---|---|---|
| Error logging | `lib/error-log.ts`, `app/api/error-logs/`, `app/app/settings/error-log/page.tsx` | `app/api/error-logs/**/*.test.ts` | — |
| Quote follow-up worker | `lib/quotes/follow-up-worker.ts`, `app/api/cron/quote-follow-ups/route.ts` | `lib/quotes/follow-up-worker.test.ts` | `quote_follow_up_enabled`, `quote_follow_up_cadence`, `quote_follow_up_template` |
| Backup create/restore | `lib/backup/create-backup.ts`, `app/api/backups/restore/route.ts`, `app/api/cron/backup/route.ts`, migration `20260528110000_backup_restore_function.sql` | `app/api/backups/restore/route.test.ts`, `app/api/cron/backup/route.test.ts` | — |
| Reports | `lib/reports/*.ts`, `app/api/reports/[report]/(export/)route.ts`, `app/app/reporting/page.tsx` | `lib/reports/*.test.ts` | `read_only_exports_allowed` |
| Refund auto-calc | `lib/invoices/calculate-refund.ts`, `app/api/jobs/[id]/cancel/route.ts` | `app/api/jobs/[id]/cancel/route.test.ts` | `deposit_refundable` |
| E2E scenarios | `tests/e2e/` (Vitest) | — | — |
| App version | `lib/version.ts` | — | — |
| UAT manual scripts | `.cursor/agent-handoffs/uat_checklist.md` | — | — |

---

## 4. Verification log (this session)

All commands run from project root in PowerShell, 2026-05-29.

| Command | Status | Notes |
|---|---|---|
| `pnpm install` | ✅ | `Lockfile is up to date, resolution step is skipped. Already up to date.` (pnpm 10.30.3) |
| `pnpm db:reset` | ✅ | All migrations through `20260528110000_backup_restore_function.sql` applied; seed loaded; storage buckets refreshed. `Finished supabase db reset on branch main.` |
| `pnpm db:types` | ⚠️ committed | Regenerated `lib/supabase/types.ts`; `git diff --stat` showed `1 file changed, 45 insertions(+)` — that delta is the Phase 1–6 schema additions surfaced to TypeScript and is committed as part of Phase 7 rather than left dangling. |
| `pnpm test:ci` | ✅ | `Test Files 111 passed (111)` / `Tests 688 passed (688)` / duration 34.65s — incl. error-log (15), quote follow-up worker (8), backup cron (4), backup restore (8), reports (24 across 5 helpers), refund auto-calc (6), and three Vitest E2E scenarios (BT enquiry→quote, RR enquiry→voucher, cancel+refund). |
| `pnpm build` | ✅ | Next.js 16.1.6 (Turbopack); `Compiled successfully in 8.8s`; 53 static + dynamic routes generated. |
| `pnpm app:version:bump` | ✅ | Bumped once at end of session — see `lib/version.ts`. |

---

## 5. Known human work outstanding

- `todo.md` **Phase 33** — full UAT runthrough across the four roles. Script:
  `.cursor/agent-handoffs/uat_checklist.md`.
- `todo.md` **Phase 35** — the manual lines:
  - Manual smoke test completed on `http://localhost:3000`.
  - Settings and roles manually checked.
  - Email sync tested with safe/test mailbox.
  - PDF generation tested.
  - File upload tested.
  - Backup job tested in non-production. (Automated round-trip covers local;
    human confirms in a real non-prod env.)
  - Restore tested in non-production. (Same note as above.)
  - UAT feedback captured. (Depends on Phase 33 runthrough.)
- "All MVP checklist items either complete or explicitly deferred" — tick once the next
  reviewer scans `todo.md` end-to-end and agrees only the items in §5 remain.

---

## 6. Operator quick-start

1. `pnpm install`
2. `pnpm db:reset` (resets local Supabase + seeds defaults)
3. `pnpm dev` → `http://localhost:3000`
4. Use seeded role credentials from `supabase/seed.sql` / `lib/seed-data.ts`.
5. For cron locally:
   `curl -H "Authorization: Bearer $env:CRON_SECRET" http://localhost:3000/api/cron/<job>`.
