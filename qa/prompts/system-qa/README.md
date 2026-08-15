# System QA Prompt Suite

Nineteen QA prompts that, run in order, exercise the Luxus Sales System end to
end — from bringing up the environment and creating a user, through capturing an
enquiry, quoting, invoicing, taking payment, issuing a voucher, and closing or
losing the booking, out to reporting, audit, automation and accessibility.

These are **QA session prompts**: you paste one into Claude Code, Claude drives
the real app in a browser, and it writes an evidence-backed findings report.
They are distinct from the prompts in the parent directory (`qa/prompts/01-supplier.md`
etc.), which instruct Claude to *author Playwright specs*.

## How to run one

```
Run the QA pass in @qa/prompts/system-qa/01-environment-smoke.md
```

Claude reads `_preamble.md` (the shared contract), brings up the environment,
drives the checks, and writes `qa/reports/system-qa/{date}-01-environment-smoke.md`.

Run `/clear` between prompts. One prompt per session.

## Order matters

| Block | Prompts | Why in this order |
|---|---|---|
| Setup | 01–07 | Environment, users, roles, settings, and the catalogue data (customers, suppliers, packages) that later prompts consume |
| Lifecycle | 08–15 | One booking walked from enquiry to closed, plus the lost/cancelled branch |
| Sweep | 16–19 | Documents, email, automation, and the cross-cutting surfaces |

Prompts 02–19 assume prompt 01 has reset and seeded the database. Do **not**
`pnpm db:reset` mid-suite unless a prompt says so — you will destroy the booking
that 08–15 build on.

If a prerequisite is missing, the prompt tells you to mark the affected checks
**BLOCKED on QA-{NN}** rather than inventing fixtures.

## The prompts

| # | File | Area |
|---|---|---|
| 01 | `01-environment-smoke.md` | Environment bring-up, login, every route renders |
| 02 | `02-auth-users-sessions.md` | Login, password reset, user CRUD, session timeout |
| 03 | `03-role-permissions.md` | Role matrix, route gating, API 401/403 |
| 04 | `04-settings-configuration.md` | Every settings card and its downstream effect |
| 05 | `05-customers.md` | Customer CRUD, duplicates, linked accounts, CSV import |
| 06 | `06-suppliers-rate-cards.md` | Suppliers, locations, routes, suite types, rate cards |
| 08 | `08-enquiry-intake-manual.md` | Manual enquiry capture, booking numbering, inbox |
| 09 | `09-email-intake-auto-build.md` | Inbound email accounts, rules, parsing, auto-build |
| 10 | `10-build-booking-services.md` | Build Booking, services, travellers, transport |
| 11 | `11-quoting-pricing.md` | Quotes, pricing, revisions, quote PDF |
| 12 | `12-pipeline-gates.md` | Stage machine gates, enquiry → deposit_requested, override |
| 13 | `13-invoicing-payments.md` | Invoices, payments, refunds, balance model |
| 14 | `14-vouchers-closing.md` | Voucher readiness, voucher/itinerary/worksheet PDFs, closing |
| 15 | `15-lost-cancellation-refunds.md` | Lost path, cancellation, refund capture |
| 16 | `16-documents-storage-branding.md` | Document library, storage, PDF branding |
| 17 | `17-email-templates-outbound.md` | Templates, signatures, outbound send, correspondence |
| 18 | `18-automation-cron-webhooks.md` | Cron jobs, Gravity Forms webhook, enquiry webhook |
| 19 | `19-reporting-audit-cross-cutting.md` | Reporting, audit, error log, a11y, responsive |

**Note:** Prompt 07 was retired on 2026-08-13 when the catalogue-package model was dropped from
the database (`supabase/migrations/20260811140000_drop_catalogue_packages.sql`). The numbering is
intentionally non-contiguous. Build Booking — the replacement model — is covered by prompt 10.

`COVERAGE.md` maps every route, API route and domain module to the prompt that
covers it — and lists what is deliberately not covered. That file is what makes
"we have tested the system" a checkable claim rather than a feeling.

## Output

- Reports: `qa/reports/system-qa/{YYYY-MM-DD}-{NN}-{slug}.md`
- Screenshots: `qa/screenshots/system-qa/{NN}/`

Both directories are gitignored. If you want a run archived, copy the report out
deliberately.

## After a full pass

1. Collect the 19 verdicts into one summary (GREEN / YELLOW / RED per area).
2. Rank all Sev-1 and Sev-2 findings across the whole suite.
3. Check the residual list in `COVERAGE.md` and decide whether anything on it
   has become worth covering.
