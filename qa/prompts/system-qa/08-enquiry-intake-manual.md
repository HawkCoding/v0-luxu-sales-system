# QA 08 — Enquiry Intake (Manual)

Read `@qa/prompts/system-qa/_preamble.md` first. Do not skip it.

## Goal

Capture a booking the way a consultant does on the phone: manually, through the
New Enquiry dialog. This prompt creates **the booking that prompts 10–15 walk
through the entire lifecycle**, so record its booking number and id carefully.

## Prerequisites

QA 05 (QA customer exists), QA 06 (supplier). Run as consultant
(leonie) — this is a consultant's daily job — and repeat the gated bits as admin.

## Surfaces under test

- [app/app/enquiries/page.tsx](../../../app/app/enquiries/page.tsx) — inbox, filter chips, audit export
- [components/new-enquiry-dialog.tsx](../../../components/new-enquiry-dialog.tsx) — `manual` and `paste` tabs (paste is QA 09)
- [app/app/pipeline/page.tsx](../../../app/app/pipeline/page.tsx) — `table`, `kanban`, `drafts` tabs
- [components/job-enquiry-tab.tsx](../../../components/job-enquiry-tab.tsx) (~1370 lines)
- [lib/job-numbering.ts](../../../lib/job-numbering.ts)
- [app/api/jobs/[id]/route.ts](../../../app/api/jobs/[id]/route.ts), [app/api/pipeline/route.ts](../../../app/api/pipeline/route.ts)
- [lib/booking-visibility.ts](../../../lib/booking-visibility.ts)

## Checks

### Create

1. New Enquiry → **manual** tab. Create a booking for the QA customer from
   QA 05: travel dates `2026-09-12 → 2026-09-16`, 2 adults, 0 children, leisure,
   source website, the QA supplier from QA 06.
   **Record the booking id and booking number.**
2. **Booking number format** — `BT-YYYY-NNNN` per `lib/job-numbering.ts`.
   Confirm the year segment and that the sequence increments. Create a second
   enquiry immediately and confirm no collision.
3. Create an enquiry for a **new** customer inline (not an existing one) — the
   customer is created and linked in one action.
4. Create an enquiry with children and infants; confirm the pax breakdown lands
   in the right age buckets.
5. Required-field validation on the dialog; then send the same payload straight
   to the API with fields missing and confirm Zod rejects it with a 400.
6. Cancel the dialog midway → nothing created.
7. `create:enquiry` gating: every current role (admin, manager, consultant) holds
   this permission, so confirm the dialog opens for each and that an
   unauthenticated `POST` of the create is rejected with 401.

### Enquiry tab

8. Every field on the booking's Enquiry tab: edit, save, reload, persisted.
9. Consultant assignment — assign, reassign, and confirm the booking's visibility
   respects `lib/booking-visibility.ts` for the assigned vs unassigned user.
10. `customer_complete` readiness indicator: strip a field from the customer
    (phone), return to the booking, confirm the incompleteness is visible **here**
    rather than only when the stage move is attempted. If it is not surfaced,
    that is Sev-3 — the consultant finds out too late.
11. Restore the customer field afterwards.

### Inbox

12. `/app/enquiries` filter chips — Needs Review, Complete, and every other chip.
    Each filters correctly and the counts match the rows.
13. The new enquiry appears in the inbox in the right chip.
14. Audit export from the inbox produces a file; open it and confirm it contains
    the expected columns and the new enquiry's row.

### Pipeline

15. Pipeline **kanban** tab (default) — the new booking is in the `enquiry`
    column. Drag it (if drag is supported) and confirm `edit:pipeline` gating.
16. Pipeline **table** tab — hidden behind the per-user Pipeline Settings toggle.
    Enable the toggle, confirm the tab appears and lists the booking; disable it
    again.
17. Pipeline **drafts** tab — confirm what qualifies as a draft and that the
    manual enquiry does or does not appear there (record which, and whether that
    matches expectation).
18. `GET /api/pipeline` returns bookings, quotes, payments and correspondence in
    one payload — confirm the new booking's entry is complete and that counts on
    the board match the DB.

### Booking list

19. `/app/bookings` search and every filter: supplier, payment status,
    consultant, created date, departure date. Individually and combined.
20. The new booking appears with the right consultant, stage and dates.
21. `/app/jobs` redirects to `/app/bookings`; `/app/bookings/{id}` and
    `/app/jobs/{id}` render the same detail page.

## Probes

- Create an enquiry with a departure date in the past → allowed or blocked?
  Record the behaviour; a past-dated booking will break the voucher readiness
  check in QA 14.
- Create an enquiry with 0 passengers → must be rejected.
- Create two enquiries in parallel (two tabs, submit simultaneously) → confirm
  `lib/job-numbering.ts` does not issue the same number twice. A duplicate
  booking number is Sev-1.
- `PATCH /api/jobs/{id}` as readonly → 403.

## Report

`qa/reports/system-qa/{date}-08-enquiry-intake-manual.md`

Extra sections:

- **THE QA BOOKING** — id, booking number, customer, package, supplier, dates,
  pax. Prompts 10–15 all reference this. Put it at the very top of the report.
- **Secondary bookings created** (for the numbering and parallel probes), so
  later prompts know they exist.
- **Filter matrix**: filter · value · rows returned · correct?

## Acceptance

- The QA booking exists in `enquiry` stage, fully populated, and is documented at
  the top of the report.
- Booking numbering probed for collisions, including the parallel case.
- All three pipeline tabs exercised.
