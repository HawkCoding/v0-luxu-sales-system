# QA 15 — Lost, Cancellation & Refunds

Read `@qa/prompts/system-qa/_preamble.md` first. Do not skip it.

## Goal

The unhappy path. A booking can be lost before any money moves, or cancelled
after a deposit or a full payment — and in the paid cases the system must force
the refund to be captured rather than letting money quietly disappear from the
records. This is the branch most likely to be under-tested in normal use.

## Prerequisites

QA 08–13 patterns understood. **Do not use the QA booking** — it is closed and
still needed as evidence. Create fresh bookings for each scenario below, using
the QA customer, supplier and package.

## Surfaces under test

- [lib/pipeline/validate-transition.ts](../../../lib/pipeline/validate-transition.ts) — the `lost` short-circuit: `cancel_reason`, `refund_capture`
- [app/api/jobs/[id]/cancel/route.ts](../../../app/api/jobs/[id]/cancel/route.ts)
- [app/api/jobs/[id]/outcome/route.ts](../../../app/api/jobs/[id]/outcome/route.ts)
- [components/cancel-booking-dialog.tsx](../../../components/cancel-booking-dialog.tsx)
- [app/app/settings/outcome-reasons/page.tsx](../../../app/app/settings/outcome-reasons/page.tsx) (orphan route), `app/api/settings/outcome-reasons/*`
- [lib/invoices/calculate-refund.ts](../../../lib/invoices/calculate-refund.ts)
- [lib/invoices/sync-booking-payment-state.ts](../../../lib/invoices/sync-booking-payment-state.ts)

## Setup — build four bookings

| Booking | State to reach |
|---|---|
| **L1** | `enquiry`, no quote, no money |
| **L2** | `quote_sent`, quote sent, no money |
| **L3** | `deposit_paid`, deposit invoice sent and deposit paid |
| **L4** | `final_paid`, paid in full |

Use the QA 08–13 recipes. Record each booking's number and total.

## Checks

### Outcome reasons

1. `/app/settings/outcome-reasons` — add a Lost reason and a Cancelled reason,
   toggle one inactive. `isManager` (admin+manager) gating: confirm consultant is
   blocked at the page and at the API.
2. Active reasons appear in the cancel/lost picker; the inactive one does not,
   but bookings already using it still render its label.
3. Re-flag from QA 01 that this page has **no inbound link** anywhere in the app.

### `cancel_reason` gate

4. **L1 → `lost`** with no `cancelReason` → blocked. With a reason → allowed.
   Confirm the `lost` path short-circuits all other gates (an incomplete customer
   must not block marking a booking lost).
5. **L2 → `lost`** with a reason → allowed. Confirm the sent quote is not
   silently deleted and remains viewable.
6. Free-text reason vs picked reason — record which the system stores and whether
   both are supported.

### `refund_capture` gate

The gate fires when the *from* stage is one of `deposit_paid`, `final_paid`,
`voucher_sent`, `closed`, `trip_active`.

7. **L3 → `lost`** with `cancelReason` but **no** `refundStatus` → blocked.
8. L3 → `lost` with `refundStatus` set to a non-refunded value (e.g. retained /
   forfeited — record the actual options) → allowed, no refund fields required.
9. L3 → `lost` with `refundStatus = 'refunded'` but missing `refundAmount` →
   blocked. Missing `refundReference` → blocked. Missing `refundedAt` → blocked.
   Test each omission separately.
10. `refundAmount` negative → blocked (the gate requires ≥ 0).
11. L3 → `lost` fully populated → allowed. Verify all four refund fields are
    stored on the booking and visible afterwards.
12. **L4 → `lost`** from `final_paid` with a full refund. Verify:
    - `lib/invoices/calculate-refund.ts` produces the expected refund figure
      against the paid total,
    - `invoice_balance` after the refund,
    - whether `deposit_paid` and the stage timestamps are reconciled or left
      stale. A booking marked lost while still flagged paid-in-full is Sev-2 —
      record precisely what remains set.
13. A **partial** refund on L4 — refund less than the paid total. Confirm the
    remaining amount is still traceable in the ledger.
14. Cancel a booking from `voucher_sent` (build a fifth booking if needed, or
    reuse the closed QA booking's clone). The guest already has travel documents
    — confirm what happens to the `voucher_pdf` document status. A voucher left
    marked `sent` and still downloadable on a cancelled booking is at least
    Sev-2; record the behaviour either way.

### Cancel booking route

15. `POST /api/jobs/{id}/cancel` — the dedicated cancel path, distinct from the
    `lost` transition. Determine and document **which one the UI actually uses**
    and whether they can produce different end states. Two paths to the same
    outcome that disagree is Sev-2.
16. Verify its effects on: `invoices` (voided?), `payments` (retained?),
    `pipeline_history` (row written?), and the booking's stage/outcome.
17. Cancel a booking that has no invoices and no payments → clean, no error.
18. Cancel an already-cancelled booking → idempotent or a clear error, never a
    duplicate history row.

### Outcome endpoint

19. `PATCH /api/jobs/[id]/outcome` — set Won and Lost directly. Confirm
    `outcome_set_at` is stamped and the outcome reason is required for Lost.
20. Setting outcome Won manually on a booking that never reached `voucher_sent` —
    allowed? Record it; QA 14 showed `voucher_sent` auto-sets Won, so a manual
    path that disagrees is worth flagging.
21. Reversing an outcome (Lost → Won) — allowed, blocked, or audited? Record.

### Reporting consistency

22. After the cancellations, check `/app/reporting`: conversion rate, sales per
    salesperson and outstanding payments must all treat the lost/cancelled
    bookings consistently. A cancelled booking still counted as revenue is Sev-2.
    (Full reporting coverage is QA 19 — here only the cancellation impact.)
23. The pipeline board and booking list show the lost bookings in the right
    place, with the reason visible.

## Probes

- `POST /api/jobs/{id}/cancel` as consultant, and unauthenticated → check
  `cancel:booking` enforcement at the API. A profile carrying the retired
  `readonly` clearance level (if one can be manufactured) must get 403.
- Mark a booking lost, then attempt to move it forward again → blocked or
  reopenable? Record the recovery path; if there is none, a mis-click is
  unrecoverable, which is Sev-2.
- Record a payment on a lost booking.
- Refund an amount greater than the total paid → must be rejected.

## Report

`qa/reports/system-qa/{date}-15-lost-cancellation-refunds.md`

Extra sections:

- **Setup bookings**: L1–L4 numbers, stages reached, amounts paid.
- **Refund gate matrix**: from-stage · field omitted · blocked? · message.
- **Post-cancellation state table**: booking · stage · outcome · `invoice_balance` ·
  `deposit_paid` · invoices · payments · voucher document status. This table is
  where stale state shows up.
- **`cancel` route vs `lost` transition**: side-by-side of the resulting state.

## Acceptance

- All four L-bookings created and cancelled by different routes.
- Every field omission in check 9 tested individually.
- Check 15 (two cancellation paths) answered definitively.
- Post-cancellation state table complete for every booking.
