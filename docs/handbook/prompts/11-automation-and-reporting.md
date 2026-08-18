# Step 11 — Automation and Reporting

> Read `docs/handbook/_preamble.md` first, then do only this step.

**Model:** Sonnet 5 · **Effort:** medium
**Output:** `docs/handbook/content/automation-and-reporting.md`
**Screenshot slugs:** `r-*` · new describe block `automation and reporting`

## Scope

Deliberately an **overview**, not a manual. What runs on its own, where the numbers come
from, and who to call. Around eight printed pages.

## Source of truth — read these

- `app/api/cron/email-sync/route.ts`, `/pipeline-auto-close/route.ts`,
  `/quote-follow-ups/route.ts`, and the `crons` block in `vercel.json`
- `app/api/webhooks/gravity-forms/route.ts`, `app/api/enquiries/route.ts`
- `lib/inbound-email/`, `app/app/settings/` inbound-email accounts and rules
- `app/app/reporting/page.tsx`, `app/api/reports/[report]/route.ts`, `/export/route.ts`
- `app/app/audit/page.tsx`, `app/app/audit/archive/page.tsx`
- `app/app/settings/error-log/page.tsx`

## Must cover

1. **Enquiries that arrive by themselves** — the website form and monitored mailboxes.
   What the system does with each, and where they land. One page.
2. **Inbound email accounts and rules** — where they are configured and what a rule can do.
   Names and purposes only; no protocol detail, no credentials.
3. **What runs on a schedule** — the three jobs, roughly when each runs, and what a user
   would notice: mailbox sync, quote follow-up reminders, automatic closing of old
   bookings. State what happens if one does not run.
4. **Reporting** — each card on the Reporting page, what it counts, and the filtered
   reports section with CSV export. Be precise about what "revenue" means in each card.
5. **The audit log** — what is recorded, how to search it, the per-booking audit tab, the
   archive, and downloading an audit trail for one booking.
6. **The error log** — what lands there, what resolving an entry means, and the badge that
   appears in the sidebar.

> [!NOTE]
> This document tells a manager what exists and where to look. Anything requiring a code
> change or a server setting belongs in the Technical Handover Sheet.

## Screenshots to capture

| Slug | Shows |
|---|---|
| `r-reporting` | The Reporting page |
| `r-filtered-report` | A filtered report with the export button |
| `r-audit` | The audit log |
| `r-error-log` | The error log |
| `r-inbound-rules` | Inbound email rules in Settings |

## Done when

- No section runs longer than a page.
- Nothing in the document requires a terminal to act on.
