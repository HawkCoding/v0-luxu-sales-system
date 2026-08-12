# System QA — Coverage Matrix

Every user-facing route, API route and domain area mapped to the prompt that
covers it. This file is what makes "we have tested the system" checkable rather
than a feeling. Update it whenever a route is added.

Counts at time of writing: **31 page routes**, **122 API route files**.

---

## Page routes

| Route | Prompt(s) |
|---|---|
| `/` → `/login` | 01 |
| `/login` | 01, 02 |
| `/auth/callback` | 02 |
| `/auth/set-new-password` | 02 |
| `/app` (dashboard) | 01, 17 (queue), 19 (KPIs) |
| `/app/enquiries` | 08 |
| `/app/pipeline` (table / kanban / drafts) | 08, 12 |
| `/app/bookings` | 08 |
| `/app/bookings/[id]` · `/app/jobs/[id]` | 10–15 (all ten tabs) |
| `/app/jobs` → redirect | 01 |
| `/app/customers` · `/app/customers/[id]` | 05 |
| `/app/suppliers` · `/app/suppliers/[slug]` | 06 |
| `/app/packages` · `/app/packages/[slug]` **(deleted — must 404)** | 01, 07 |
| `/app/quotes` **(deleted — must 404)** | 01 |
| `/app/payments` **(orphan — dashboard cards only)** | 01, 13 |
| `/app/documents` | 16 |
| `/app/correspondence` | 17 |
| `/app/templates` (emails / guest-docs / billing-docs / branding) | 17, 16 |
| `/app/reporting` | 19 |
| `/app/audit` · `/app/audit/archive` | 19, 03 (gating) |
| `/app/settings` | 04, 03 (gating) |
| `/app/settings/customer-import` | 05 |
| `/app/settings/rate-types` | 04 |
| `/app/settings/error-log` | 19 |
| `/app/settings/email-signatures` (brands / defaults) | 17 |
| `/app/settings/outcome-reasons` **(orphan — no inbound link)** | 01, 15 |

Booking-detail tabs — `enquiry` 08/10 · `quotes` 11 · `reservation` 10 ·
`references` 14 · `payments` 13 · `correspondence` 17 · `documents` 16 ·
`attachments` 16 · `notes` 08 · `audit` 19.

---

## API routes

| Route | Prompt |
|---|---|
| `api/audit`, `api/audit/export` | 19 |
| `api/backups`, `/[id]`, `/restore` | 18 |
| `api/bookings/[id]/notes`, `/[noteId]` | 08 |
| `api/branding` | 01 |
| `api/client-errors` | 19 |
| `api/correspondence`, `/[id]` | 17 |
| `api/cron/backup` | 18 |
| `api/cron/email-sync` | 18 |
| `api/cron/pipeline-auto-close` | 18 |
| `api/cron/quote-follow-ups` | 18 |
| `api/customers`, `/[id]`, `/detect-match` | 05 |
| `api/customers/[id]/linked-accounts`, `/[accountId]` | 05 |
| `api/customers/import`, `/check` | 05 |
| `api/data` | **thin — see residual list** |
| `api/dev/replay-inbound-email` | 09 |
| `api/documents/[id]`, `api/documents/upload` | 16 |
| `api/email-signature/render` | 17 |
| `api/enquiries` | 18 (auth + intake), 09 (resolution chain) |
| `api/error-logs`, `/[id]/resolve` | 19 |
| `api/invoices/deposit`, `api/invoices/[id]/reminder` | 13 |
| `api/jobs/[id]` (stage entrypoint) | 12 |
| `api/jobs/[id]/validate-stage-move` | 12 |
| `api/jobs/[id]/start-quote` | 11 |
| `api/jobs/[id]/build-booking` | 10 |
| `api/jobs/[id]/services`, `/apply`, `/confirm`, `/discard` | 10 |
| `api/jobs/[id]/passenger-totals` | 10 |
| `api/jobs/[id]/travellers` | 10 |
| `api/jobs/[id]/transport-requests` | 10 |
| `api/jobs/[id]/supplier-schedules` | 10 |
| `api/jobs/[id]/reservation-details`, `/reservation-received` | 10 |
| `api/jobs/[id]/payment-received` | 13 |
| `api/jobs/[id]/leg-references` | 14 |
| `api/jobs/[id]/worksheet` | 14 |
| `api/jobs/[id]/cancel`, `/outcome` | 15 |
| `api/jobs/[id]/clear-import-review` | 09 |
| `api/locations` | 06 |
| `api/logout` | 02 |
| `api/payments`, `/[id]` | 13 |
| `api/pdf-preview/[type]` | 16 |
| `api/pipeline` | 08 |
| `api/quotes`, `/[id]` | 11 |
| `api/quotes/[id]/pdf`, `/email-preview` | 11 |
| `api/quotes/[id]/revise`, `/cancel`, `/commission-bonus` | 11 |
| `api/rate-types`, `/[id]`, `/supplier-defaults` | 04 |
| `api/reports/[report]`, `/export` | 19 |
| `api/settings/age-bands` | 04 |
| `api/settings/app-logo` | 04 |
| `api/settings/banking` | 04, 16 (reach into invoice PDF) |
| `api/settings/brand-logo` | 16 |
| `api/settings/commission` | 04 |
| `api/settings/company` | 04 |
| `api/settings/deposit` | 04, 13 |
| `api/settings/document-brand`, `/document-text` | 16 |
| `api/settings/email-appearance` | 17 |
| `api/settings/email-attachments`, `/[id]` | 17 |
| `api/settings/email-signature` | 17 |
| `api/settings/hotel-defaults` | 04 |
| `api/settings/inbound-email/accounts`, `/[id]`, `/sync`, `/test` | 09 |
| `api/settings/inbound-email/rules`, `/[id]` | 09 |
| `api/settings/invoice-statuses` | 04, 13 |
| `api/settings/outcome-reasons`, `/[id]` | 15 |
| `api/settings/quote-follow-up` | 04, 18 |
| `api/settings/quote-validity` | 04, 11 |
| `api/settings/salesperson-credentials`, `/[id]`, `/test` | 17 |
| `api/settings/session-timeout` | 02, 04 |
| `api/settings/signature-brands`, `/[id]`, `/badges`, `/banner` | 17 |
| `api/settings/system-info` | 04 |
| `api/settings/train-child-price-ratio` | 04 |
| `api/supplier-email-labels` | 06 |
| `api/suppliers`, `/[slug]`, `/quick` | 06 |
| `api/templates`, `/[id]`, `/preview` | 17 |
| `api/users`, `/[userId]`, `/password`, `/assignable` | 02 |
| `api/voucher/generate` | 14 |
| `api/vouchers/[id]/prepare-send` | 14 |
| `api/voucher-template`, `/upload` | 16 |
| `api/webhooks/gravity-forms` | 18 |
| `app/auth/callback` | 02 |

Role/permission behaviour for **every** route above is additionally swept by
prompt **03**, which tests each at all four actor levels (admin, manager,
consultant, unauthenticated).

---

## Domain modules

| Area | Key modules | Prompt |
|---|---|---|
| Roles & permissions | `lib/role-context.tsx`, `lib/role-utils.ts`, `lib/api/auth.ts`, `lib/settings-access.ts` | 03 |
| Session | `lib/session-timeout.ts` | 02 |
| Job numbering | `lib/job-numbering.ts` | 08 |
| Booking visibility | `lib/booking-visibility.ts` | 08 |
| Pipeline | `lib/pipeline/validate-transition.ts`, `apply-transition.ts`, `constants.ts` | 12, 14, 15 |
| Quotes | `lib/quotes/*` (pricing-engine, quote-number, validity, revision-reset, accepted-quote-scope, commission-bonus, adapters) | 11 |
| Pricing | `lib/pricing/*`, `lib/rate-cards/*`, `lib/rate-card-validity.ts`, `lib/rate-types/*` | 04, 06, 11 |
| Packages | `lib/packages/*` | 07 |
| Suites | `lib/suites/*`, `lib/packages/suite-config.ts` | 06, 09 |
| Resolvers | `lib/resolvers/supplier-resolver.ts`, `route-resolver.ts` | 09 |
| Auto-build | `lib/auto-build/build-from-enquiry.ts` | 09, 10 |
| Invoices & balance | `lib/invoices/*` | 13 |
| Vouchers | `lib/voucher/*`, `lib/generate-voucher.ts` | 14 |
| Itinerary | `lib/itinerary/*` | 14 |
| Worksheet | `lib/worksheet/*` | 14 |
| PDF plumbing | `lib/pdf/*` | 16 |
| Templates | `lib/templates/*` | 17 |
| Email transport & signatures | `lib/email/*`, `lib/assets/signature-assets.ts` | 17 |
| Attachments | `lib/attachments/email-attachment-library.ts` | 17 |
| Inbound email | `lib/inbound-email/*`, `lib/import/parseEmailDraft.ts` | 09 |
| Suppliers | `lib/suppliers.ts`, `lib/supplier-editor-utils.ts`, `lib/supplier-save-guard.ts`, `lib/suppliers/*` | 06 |
| Backup | `lib/backup/create-backup.ts` | 18 (flag-gated) |
| Version | `lib/version.ts` | 01 |

---

## Deliberately not covered

State the reason, not just the omission. Anything on this list that becomes
important gets a new prompt or a new check in an existing one.

| Area | Why not covered | Where it would go |
|---|---|---|
| `api/data` (bulk seed/read of most tables) | Internal bulk-read helper, not a user flow; exercised incidentally wherever the app reads through it | 01 |
| Backups + `/api/backups/restore` | Behind `BACKUPS_ENABLED`, and a restore would destroy the data the suite depends on | 18, conditionally |
| Production restore & wipe scripts (`scripts/restore-production-*`, `wipe-production-clients.mjs`, `cleanup-production.sql`) | Production-only, destructive, out of scope for a local QA suite | — |
| Remote DB sync (`scripts/sync-remote-databases.ps1`, `db-status.ps1`, drift checks) | Covered by the `db-sync` skill and the `db-migrations` CI workflow, not by browser QA | `/db-sync` |
| TTT portal branding (Travel Through Time demo) | Env-driven branding variant on a separate deployment | — |
| Load / performance / concurrency at scale | Functional QA only; request-storm detection in 19 is the nearest proxy | — |
| Real IMAP mailbox polling against a live mail server | Local runs have no mailbox; driven through fixtures and the replay endpoint instead | 09 |
| Live Gravity Forms submissions from the real form | The live GF channel is the email path; the webhook stores raw only | 18 |
| Localisation / multi-currency | Not implemented | — |
| Mobile native / offline | Not applicable | — |

---

## Residual risk after a full pass

Even with all nineteen prompts GREEN, these remain the thinnest spots:

1. **RLS-only API routes.** Suppliers, packages, rate types, locations, quotes and
   several settings routes use the session client with no explicit `requireRole`.
   Prompt 03 probes them, but coverage depends on that probe being run
   exhaustively — treat its API status table as the single most important
   artefact in the suite.
2. **No `middleware.ts`.** Route protection is server-layout + client `useRole()`
   only, so every new page starts unguarded by default.
3. **Nav-gated pages with no page guard** (`/app/templates`, `/app/reporting`,
   `/app/settings`) — direct-URL entry is the recurring risk.
4. **Document staleness.** A quote revised after a voucher was generated
   (prompt 14 probe) is the most plausible real-world data-corruption path.
5. **`PATCH /api/payments/[id]` not re-syncing payment state** (prompt 13
   check 24) — a known suspected gap; confirm it every pass.
