# QA 18 — Automation: Cron Jobs & Webhooks

Read `@qa/prompts/system-qa/_preamble.md` first. Do not skip it.

## Goal

The unattended parts of the system: three scheduled jobs that email customers and
move bookings without a human present, and two secret-authorised intake endpoints.
Anything wrong here happens at 02:00 to every booking at once, so the priority is
authorisation, idempotency and blast radius.

## Prerequisites

QA 11 (a sent quote for the follow-up worker), QA 14 (a booking at
`voucher_sent`), QA 17 (email transport verified). Run as admin.

## Surfaces under test

- Schedules: `vercel.json` — `0 5 * * *` email-sync, `0 9 * * *`
  quote-follow-ups. `pipeline-auto-close` moved to GitHub Actions
  (`.github/workflows/pipeline-auto-close.yml`, `0 3 * * *`) to stay under the
  Vercel Hobby 2-cron limit; `email-sync` is also double-run from
  `.github/workflows/email-sync.yml` (`*/15`, best-effort) as a sub-daily
  supplement to the daily Vercel floor.
- [app/api/cron/email-sync/route.ts](../../../app/api/cron/email-sync/route.ts) (`maxDuration=60`)
- [app/api/cron/pipeline-auto-close/route.ts](../../../app/api/cron/pipeline-auto-close/route.ts)
- [app/api/cron/quote-follow-ups/route.ts](../../../app/api/cron/quote-follow-ups/route.ts), [lib/quotes/follow-up-worker.ts](../../../lib/quotes/follow-up-worker.ts)
- [app/api/cron/backup/route.ts](../../../app/api/cron/backup/route.ts), [lib/backup/create-backup.ts](../../../lib/backup/create-backup.ts) — unscheduled, `BACKUPS_ENABLED` flagged
- [app/api/webhooks/gravity-forms/route.ts](../../../app/api/webhooks/gravity-forms/route.ts) — `GRAVITY_FORMS_WEBHOOK_ENABLED`
- [app/api/enquiries/route.ts](../../../app/api/enquiries/route.ts) — the secret-authorised intake that **does** create records
- [lib/api/webhook-secret.ts](../../../lib/api/webhook-secret.ts)
- [lib/inbound-email/sync.ts](../../../lib/inbound-email/sync.ts) — `syncAllEnabledInboundEmailAccounts`

## Checks

### Authorisation — do this first

1. Each cron route (`email-sync`, `pipeline-auto-close`, `quote-follow-ups`,
   `backup`) called with **no** `Authorization` header → 401.
2. Same with a **wrong** `CRON_SECRET` bearer → 401.
3. Same while logged in as an admin but with no bearer → still 401. A cron route
   that a logged-in user can trigger is Sev-2; one an anonymous caller can
   trigger is Sev-1.
4. With the correct bearer → runs. Record the response shape.
5. `POST /api/enquiries` and `POST /api/webhooks/gravity-forms` with a missing,
   wrong, and correctly-formed-but-invalid secret → all rejected, and the
   rejection must not reveal whether the secret format was right.
6. Confirm the secrets are read from env and never logged. Grep the route
   handlers for any log line that could print the secret.

### Quote follow-ups (`0 9 * * *`)

7. Configure the follow-up cadence in Settings (QA 04 check 13). Run the job with
   a valid bearer.
8. `lib/quotes/follow-up-worker.ts` selects quotes with `status='sent'` and
   `follow_ups_disabled=false` that are due per the cadence. Construct:
   - a sent quote inside the cadence window → **not** followed up,
   - a sent quote past the window → followed up,
   - a quote with `follow_ups_disabled=true` → never followed up,
   - an **accepted** quote → never followed up (a follow-up chasing an accepted
     quote is an embarrassing Sev-2),
   - a **cancelled/expired** quote → record the behaviour.
9. Confirm the `follow_up` template from QA 17 is what gets sent, addressed to
   the right customer, with the right quote referenced.
10. **Idempotency**: run the job twice in a row. The second run must not send a
    duplicate follow-up. Duplicate customer emails from a re-run is Sev-1.
11. Confirm the follow-up is recorded in correspondence and visible on the
    booking.
12. Disable follow-ups globally in Settings → the job sends nothing.

### Pipeline auto-close (`0 3 * * *`)

13. Construct a booking at `voucher_sent` with a departure date in the past
    (within the 14-day catch-up window). Run the job.
14. Confirm: the `thank_you` email is sent, and the booking auto-closes via
    `applyTransition` (so `closed_at` is stamped and a `pipeline_history` row is
    written with the system as actor).
15. A booking whose departure is **more than 14 days** past → outside the
    catch-up window; confirm it is skipped rather than being closed silently
    months later.
16. A booking at `voucher_sent` with a **future** departure → untouched.
17. A booking at `trip_active` (the alias for `voucher_sent`) → handled the same.
18. A booking in any other stage → untouched. Verify none of the QA bookings from
    earlier prompts were moved by this job — cross-check their stages before and
    after.
19. **Idempotency**: run twice; no duplicate thank-you email, no second close.
20. A booking that fails to close (e.g. a gate blocks it) → the job continues
    with the rest and logs the failure to the error log. One bad booking aborting
    the nightly run is Sev-1.

### Email sync (`0 5 * * *` Vercel, plus `*/15` GitHub Actions)

21. Run with a valid bearer → `syncAllEnabledInboundEmailAccounts()` executes.
    With the QA 09 account configured, confirm it attempts a connection and
    reports per-account results.
22. A **disabled** account is skipped.
23. An account with bad credentials → that account fails, the others still run,
    and the failure lands in the error log with the account identified.
24. `maxDuration=60` — confirm the job handles hitting the limit without leaving
    messages permanently claimed (`STALE_PROCESSING_MS` recovery from QA 09
    check 30 is the safety net; verify it applies after a timeout).
25. Idempotency via UID dedupe: run twice with the same mailbox contents → no
    duplicate bookings (regression-check of the fix already made for this).

### Backups

26. `BACKUPS_ENABLED` — record its current value. If disabled, confirm
    `/api/cron/backup` 404s or no-ops, mark the rest **not covered**, and **do
    not enable it**.
27. If enabled: `/api/backups` GET/POST, `/[id]` GET/DELETE. Create a backup,
    list it, download it. **Do not run `/restore`** against a database other
    prompts depend on — if you test restore, do it last and re-run QA 01 after.
28. Confirm the backup routes are admin+manager gated.
29. Note in the report that `/api/cron/backup` has **no schedule in
    `vercel.json`** — a backup job that never runs is worth flagging even though
    it is flag-gated.

### Gravity Forms webhook

30. With `GRAVITY_FORMS_WEBHOOK_ENABLED` unset/false → `POST` returns **404**.
    Confirm the 404 is the disabled response and not a routing accident.
31. Enable the flag locally and POST a realistic Gravity Forms payload → a row
    lands in `gravity_forms_submissions` and **nothing else**. Confirm no
    customer and no booking are created — the mapping into the domain is
    deliberately not built, and a partial mapping appearing would be a finding.
32. Malformed payload → rejected cleanly, no 500.
33. Replay the same submission → duplicate row or dedupe? Record it.
34. Disable the flag again before finishing.

### Enquiry webhook

35. `POST /api/enquiries` with a valid secret and a full payload. Confirm it
    creates the whole record set: customer, booking, suite units, transport
    requests, travellers, auto-built services, and a draft quote — the same chain
    QA 09 verified for email intake.
36. A payload missing required fields → 400, **no partial records**. Query for
    orphaned customers or bookings after each failed attempt; a half-created
    booking from a rejected payload is Sev-2.
37. Replay the same payload → duplicate booking or dedupe? If it duplicates, say
    so plainly: this endpoint is externally callable.
38. A payload with an unknown supplier or suite phrase → review flags raised,
    booking still created (consistent with QA 09).
39. `GET /api/enquiries` — confirm what it exposes and to whom.

## Probes

- Run all three scheduled jobs back-to-back in one minute, as a real 02:00–09:00
  sequence compressed. Confirm they do not interfere.
- Call a cron route with the correct bearer but a wrong HTTP method → 405, not a
  silent run.
- Send a 5 MB payload to `/api/enquiries` → rejected or handled, never a hang.

## Report

`qa/reports/system-qa/{date}-18-automation-cron-webhooks.md`

Extra sections:

- **Auth matrix**: route · no header · wrong secret · logged-in user · correct
  secret. Every cell filled.
- **Job effect table**: job · bookings/quotes selected · emails sent · records
  changed · idempotent on re-run?
- **Blast radius**: for each job, the exact list of records it touched. Confirm
  no earlier QA booking was modified unexpectedly.
- Flag values recorded and restored (`GRAVITY_FORMS_WEBHOOK_ENABLED`,
  `BACKUPS_ENABLED`).

## Acceptance

- Every cron and webhook route tested at all four authorisation levels.
- Every job run **twice** and idempotency stated explicitly.
- The blast-radius list confirms no unintended booking was touched.
- All feature flags restored to their original values.
