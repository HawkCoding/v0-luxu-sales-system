# QA 05 — Customers & Bulk Import

Read `@qa/prompts/system-qa/_preamble.md` first. Do not skip it.

## Goal

The customer record is the gate on the whole pipeline — `customer_complete`
(first name, last name, email, phone, country) blocks every forward stage move.
This pass verifies customer creation, duplicate handling, linked accounts and
bulk import, and **leaves behind one fully-complete customer** that prompts
08–15 will book against.

## Prerequisites

QA 01 GREEN. Run as admin, then repeat the create/edit checks as consultant.
Do not reset.

## Surfaces under test

- [app/app/customers/page.tsx](../../../app/app/customers/page.tsx), [app/app/customers/[id]/page.tsx](../../../app/app/customers/[id]/page.tsx)
- [components/customer-detail-view.tsx](../../../components/customer-detail-view.tsx) — sections: customer information, linked accounts, bookings, notes
- [components/linked-account-form.tsx](../../../components/linked-account-form.tsx)
- [app/api/customers/route.ts](../../../app/api/customers/route.ts), [app/api/customers/[id]/route.ts](../../../app/api/customers/[id]/route.ts)
- [app/api/customers/detect-match/route.ts](../../../app/api/customers/detect-match/route.ts)
- [app/api/customers/import/route.ts](../../../app/api/customers/import/route.ts), [app/api/customers/import/check/route.ts](../../../app/api/customers/import/check/route.ts)
- [app/app/settings/customer-import/page.tsx](../../../app/app/settings/customer-import/page.tsx), [components/customer-import-dialog.tsx](../../../components/customer-import-dialog.tsx)
- `app/api/customers/[id]/linked-accounts/*`

## Checks

### Create & edit

1. Create a customer with **all** fields populated. Record the id — this is the
   QA customer used by prompts 08–15. Name it recognisably (e.g. "QA Suite
   Testcase").
2. Create a customer with only the required fields. Confirm which fields are
   actually required at the API vs merely marked required in the UI — a field
   the UI requires but the API does not is Sev-3; the reverse is Sev-2.
3. Edit every field on the detail view, reload, confirm persistence.
4. Country field: confirm it stores a value the `customer_complete` gate accepts
   (check against `lib/pipeline/validate-transition.ts`). A country picker that
   writes a shape the gate rejects would silently block bookings — Sev-1.
5. Invalid email and invalid phone → rejected at the API with a 400.
6. Detail view renders identically as a modal (from the list) and as a page
   (`/app/customers/{id}`, `presentation="page"`). Screenshot both.

### Duplicates

7. `GET /api/customers/detect-match` — create a customer, then start creating a
   second with the same email. Confirm the match is surfaced *before* the
   duplicate is written.
8. Same-name/different-email and same-email/different-name. Record which
   combinations are treated as matches.
9. Force through a genuine duplicate. Confirm the system allows it deliberately
   (with a warning) rather than crashing on a unique constraint.

### Linked accounts

10. Add a linked account (`POST /api/customers/{id}/linked-accounts`), edit it,
    delete it. Each round-trips and the list reflects it after a reload.
11. Confirm what a linked account does downstream — does it appear on quotes,
    invoices, or the voucher? Record the actual behaviour; if it appears nowhere,
    say so.

### Notes & bookings

12. Add, edit, and delete a customer note. `manage:notes` is admin+manager —
    confirm the consultant path.
13. The Bookings section lists the customer's bookings and links through to each
    booking detail.
14. Customer travel dates (`first_travel_date` / `last_travel_date`) — record the
    current values for the QA customer; QA 14 verifies they update on
    `voucher_sent`.

### List & filters

15. Search by name, email, phone. Each returns the right rows.
16. Every filter on the list page, individually and in combination. Clearing
    filters restores the full list.
17. Empty state: filter to zero results → a proper empty state, not a blank page
    or a spinner that never resolves.

### Bulk import

18. `/app/settings/customer-import` is reachable and gated on `import:customers`
    (admin+manager). Consultant is blocked — at the page and at the API.
19. **Preflight** (`/api/customers/import/check`) with a clean CSV of 5 rows:
    reports 5 new, 0 duplicates, 0 errors. Nothing is written yet — verify by
    counting rows in the DB before and after the check call.
20. Import the clean CSV → 5 customers created, all fields mapped to the right
    columns. Spot-check one row against the CSV field by field.
21. Preflight a CSV containing 2 rows that duplicate existing customers →
    duplicates flagged before import; confirm what the import then does with
    them (skip / update / create).
22. **Malformed CSV**: missing required column, extra unknown column, wrong
    delimiter, a row with too few fields, an invalid email, a non-UTF-8 file,
    an empty file, and a header-only file. Each must produce a clear error that
    names the offending row/column. A partial import that leaves half the rows
    written after an error is Sev-2 — check the row count after each failure.
23. Large-ish file (200+ rows) — confirm it completes and does not time out.

## Probes

- `POST /api/customers` unauthenticated → 401.
- `PATCH /api/customers/{id}` with an unknown field → ignored or 400, never a
  500 and never a silent write to an unintended column.
- Delete a customer that has bookings (if deletion exists) — confirm it is
  blocked or cascades deliberately. A dangling booking is Sev-1.

## Report

`qa/reports/system-qa/{date}-05-customers.md`

Extra sections:

- **QA customer record**: id, name, email — prompts 08–15 depend on this.
- **Import matrix**: file variant · preflight result · import result · rows
  written · error message quality.
- **Duplicate-detection matrix**: field combination · flagged as match? ·
  expected?

## Acceptance

- One fully-complete customer exists and its id is in the report.
- All nine malformed-CSV variants attempted, each with the row count after.
- Consultant and manager paths tested, not just admin.
