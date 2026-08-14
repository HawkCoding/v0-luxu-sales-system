# QA 09 — Email Intake & Auto-Build

Read `@qa/prompts/system-qa/_preamble.md` first. Do not skip it.

## Goal

The live enquiry channel is inbound email: an IMAP account is polled, subject
rules match, the body is parsed into a booking, suites and suppliers are
resolved, services are auto-built and a draft quote is created. Every one of
those steps can guess wrong, so the governing rule under test is: **the system
must never guess — an unresolved value raises a review flag instead.**

## Prerequisites

QA 06 (supplier with suite types and a suite alias), QA 08 complete. Run as
admin — inbound email settings are admin-only.

## Surfaces under test

- [components/inbound-email-settings.tsx](../../../components/inbound-email-settings.tsx), [components/email-accounts-settings.tsx](../../../components/email-accounts-settings.tsx)
- `app/api/settings/inbound-email/accounts/*` (CRUD, `/sync`, `/test`), `app/api/settings/inbound-email/rules/*`
- [lib/inbound-email/sync.ts](../../../lib/inbound-email/sync.ts) — `MAX_UIDS_PER_RUN=100`, `STALE_PROCESSING_MS=1h`, UID dedupe
- [lib/inbound-email/rules.ts](../../../lib/inbound-email/rules.ts) — contains / exact / regex
- [lib/inbound-email/import-booking.ts](../../../lib/inbound-email/import-booking.ts), [lib/inbound-email/review.ts](../../../lib/inbound-email/review.ts), [lib/inbound-email/crypto.ts](../../../lib/inbound-email/crypto.ts), [lib/inbound-email/html.ts](../../../lib/inbound-email/html.ts)
- [lib/import/parseEmailDraft.ts](../../../lib/import/parseEmailDraft.ts)
- [lib/suites/resolve-suite-phrase.ts](../../../lib/suites/resolve-suite-phrase.ts), [lib/suites/suite-vocabulary.ts](../../../lib/suites/suite-vocabulary.ts), [lib/suites/missing-fields.ts](../../../lib/suites/missing-fields.ts)
- [lib/resolvers/supplier-resolver.ts](../../../lib/resolvers/supplier-resolver.ts), [lib/resolvers/route-resolver.ts](../../../lib/resolvers/route-resolver.ts)
- [lib/auto-build/build-from-enquiry.ts](../../../lib/auto-build/build-from-enquiry.ts), [lib/quotes/create-draft-quote.ts](../../../lib/quotes/create-draft-quote.ts)
- [app/api/jobs/[id]/clear-import-review/route.ts](../../../app/api/jobs/[id]/clear-import-review/route.ts)
- Fixtures: `supabase/seeds/inbound-email-fixtures/`
- Replay tool: [app/api/dev/replay-inbound-email/route.ts](../../../app/api/dev/replay-inbound-email/route.ts)

Locally there is no real IMAP mailbox. Drive parsing and import through the
**paste tab** and `POST /api/dev/replay-inbound-email` with the fixtures; drive
account/rule configuration through the settings UI and the `/test` endpoint.

## Checks

### Accounts & rules

1. Create an inbound email account. Confirm the password is stored encrypted
   (`lib/inbound-email/crypto.ts`) — read the row directly and confirm it is not
   plaintext. Plaintext credentials at rest are Sev-1.
2. `POST /accounts/{id}/test` against a bad host/port/credential → a clear
   failure message, no stack trace, no credential echoed back.
3. Edit and delete an account; confirm the credential is removed with it.
4. Create rules of each match type: **contains**, **exact**, **regex**. For each,
   supply a subject that matches and one that does not.
5. An invalid regex in a rule → rejected at save time, not at sync time. A bad
   regex that crashes the nightly sync is Sev-1.
6. Rule ordering / precedence when two rules match the same subject — record the
   actual behaviour.
7. Inbound settings are admin-only: manager and consultant blocked at the page
   and at the API.

### Parsing

8. Paste tab of the New Enquiry dialog with a realistic enquiry email
   (use a fixture). Confirm `parseEmailDraft` extracts: customer name, email,
   phone, country, travel dates, pax counts, suite phrase, supplier, route.
9. Screenshot the parsed preview before confirming — the consultant must be able
   to see and correct every extracted field before anything is written.
10. HTML email with nested tables and inline styles → `lib/inbound-email/html.ts`
    flattens it without dropping content or leaking markup into fields.
11. A deliberately messy email: missing phone, ambiguous date format
    (`03/04/2026`), pax written in prose ("a couple travelling with their
    daughter"). Record what is extracted, what is left blank, and — critically —
    whether anything is **invented**. An invented value is Sev-1.
12. A non-enquiry email (an out-of-office reply, a supplier invoice) → must not
    produce a booking.

### Suite resolution

13. A suite phrase exactly matching a configured suite type → resolved, no flag.
14. A suite phrase matching the **alias** created in QA 06 → resolved via
    `lib/suites/suite-alias-store.ts`, no flag.
15. An unknown suite phrase → **review flag raised, no guess**. Confirm
    `lib/suites/missing-fields.ts` reports which fields are missing and that the
    booking is still created for a human to finish.
16. Self-confirming aliases: after a human resolves an unknown phrase, confirm
    the alias is learned (`lib/suites/learn-from-units.ts`) and the same phrase
    resolves without a flag next time.

### Supplier & route resolution

17. Supplier name matching the QA supplier exactly → resolved.
18. Supplier name with a typo or a partial match → record whether it resolves or
    flags. A wrong supplier silently attached is Sev-1.
19. Route resolution from "Pretoria to Cape Town" style text, including the
    reverse direction.
20. Unknown supplier → flagged, booking still created.

### Import & auto-build

21. Import a fixture end to end. Verify the created records: customer, booking
    (with a `LTT-YYYY-NNNN` number), suite units, transport requests, travellers.
22. `lib/auto-build/build-from-enquiry.ts` produced `booking_services` with
    `origin='auto'`.
23. `lib/quotes/create-draft-quote.ts` produced a draft quote. Confirm it is a
    draft, not sent, and that its line items reflect the auto-built services.
24. The imported booking shows `email_import_needs_review` where flags were
    raised, and appears under the **Needs Review** chip in `/app/enquiries`.
25. The review UI on the booking detail lets a human see the raw email alongside
    the parsed values.
26. `POST /api/jobs/{id}/clear-import-review` resolves the flag, stamps
    `email_import_review_resolved_at`, and the booking leaves the Needs Review
    chip. `[A/M]` gated — confirm consultant is blocked.
27. **The stage gate.** With the review flag unresolved, attempt any forward
    stage move. The `email_import_review` gate in
    `lib/pipeline/validate-transition.ts` must block it. Then clear the review
    and confirm the move proceeds.
28. `source='email'` bookings clear `raw_text` when they leave the `enquiry`
    stage — confirm in the DB after a forward move.

### Sync mechanics

29. `POST /accounts/{id}/sync` manually. Confirm UID-based dedupe: replay the
    same fixture twice and confirm **one** booking, not two. A duplicate booking
    from a retry is Sev-1 (this was fixed once already — regression-check it).
30. Stale claim recovery: a message left in `processing` for over
    `STALE_PROCESSING_MS` is reclaimed on the next run.
31. `MAX_UIDS_PER_RUN=100` — confirm a batch larger than 100 is capped and the
    remainder is picked up on the following run rather than dropped.
32. A parse failure on one message must not abort the batch; confirm the rest
    still import and the failure lands in the error log
    (`/app/settings/error-log`).

## Probes

- `POST /api/dev/replay-inbound-email` — confirm it is dev-only and unreachable
  in a production build. A live replay endpoint in production is Sev-1.
- Feed an email whose "customer" email address matches an existing customer →
  does it link or duplicate? Cross-check against QA 05's duplicate rules.
- Feed an email with a travel date in the past and one 5 years out.
- Feed a 2 MB email body → no timeout, no truncation mid-field.

## Report

`qa/reports/system-qa/{date}-09-email-intake-auto-build.md`

Extra sections:

- **Parse matrix**: fixture · field · extracted value · correct? · invented?
  The "invented?" column is the point of this report.
- **Resolution matrix**: phrase/name · resolver · resolved to · flagged?
- **Imported bookings created**, with ids, so later prompts and cleanup know.

## Acceptance

- Checks 11, 15, 18 and 29 conclusive — no invention, no guessing, no duplicates.
- Check 27 (review flag blocks the stage move) proven in both directions.
- Credential encryption at rest confirmed by reading the row.
