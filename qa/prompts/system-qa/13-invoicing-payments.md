# QA 13 — Invoicing, Payments & the Balance Model

Read `@qa/prompts/system-qa/_preamble.md` first. Do not skip it.

## Goal

Money. This system uses a **one-invoice model** — a single live invoice per
booking, of kind `deposit` or `full`, amended rather than replaced — and derives
`invoice_balance` from the accepted quote minus payments. Every number a customer
sees comes out of this pass, and a booking cannot be confirmed without
`deposit_paid = TRUE`, nor a voucher issued unless the balance is zero.

## Prerequisites

QA 12 (QA booking in `deposit_requested`, accepted quote with a known total).
Run as consultant, with manager for the gated bits.

## Surfaces under test

- [app/api/invoices/deposit/route.ts](../../../app/api/invoices/deposit/route.ts) — POST creates/refreshes, PATCH marks `sent`/`void`
- [app/api/invoices/[id]/reminder/route.ts](../../../app/api/invoices/[id]/reminder/route.ts)
- [app/api/payments/route.ts](../../../app/api/payments/route.ts), [app/api/payments/[id]/route.ts](../../../app/api/payments/[id]/route.ts)
- [app/api/jobs/[id]/payment-received/route.ts](../../../app/api/jobs/[id]/payment-received/route.ts)
- [lib/invoices/calculate-balance.ts](../../../lib/invoices/calculate-balance.ts), [lib/invoices/sync-booking-payment-state.ts](../../../lib/invoices/sync-booking-payment-state.ts)
- [lib/invoices/render-invoice-pdf.ts](../../../lib/invoices/render-invoice-pdf.ts), [lib/invoices/ensure-invoice-pdf.ts](../../../lib/invoices/ensure-invoice-pdf.ts) (`INVOICE_BUCKET="invoices"`)
- [lib/invoices/build-invoice-view.ts](../../../lib/invoices/build-invoice-view.ts), [build-unified-totals.ts](../../../lib/invoices/build-unified-totals.ts), [describe-invoice-line.ts](../../../lib/invoices/describe-invoice-line.ts), [fold-commission-line.ts](../../../lib/invoices/fold-commission-line.ts), [banking-details-block.ts](../../../lib/invoices/banking-details-block.ts), [invoice-status.ts](../../../lib/invoices/invoice-status.ts)
- [lib/pipeline/constants.ts](../../../lib/pipeline/constants.ts) — `DEFAULT_DEPOSIT_PERCENTAGE = 25`, `calculateDepositAmount`
- [components/generate-deposit-invoice-dialog.tsx](../../../components/generate-deposit-invoice-dialog.tsx), [components/job-payments-tab.tsx](../../../components/job-payments-tab.tsx), [components/send-payment-confirmation-button.tsx](../../../components/send-payment-confirmation-button.tsx), [components/send-payment-reminder-button.tsx](../../../components/send-payment-reminder-button.tsx)
- [app/app/payments/page.tsx](../../../app/app/payments/page.tsx) — the payment register (orphan route)

## Checks

### Invoice generation

1. **Guest details gate.** Remove an ID/passport number from one traveller and
   attempt to generate a deposit invoice → **422** naming the traveller. Restore
   and confirm it then generates. A 500 instead of a 422 here is Sev-2.
2. Generate a **deposit** invoice at the default 25%. Verify
   `calculateDepositAmount` against the accepted quote total by hand.
3. Generate with a **per-job override** percentage (e.g. 40%). Confirm the
   override applies to this invoice only and the global default is untouched.
4. Switch the booking's invoice mode from `deposit` to `full` → the existing row
   is **reused or voided**, never leaving two live invoices. Verify the DB: at
   most one non-void invoice per booking. Two live invoices is Sev-1.
5. Switch back from `full` to `deposit`. Same assertion.
6. Regenerate the invoice after changing a quote line → the invoice reflects the
   new total (`ensure-invoice-pdf.ts` always re-renders — confirm no stale PDF).

### Invoice document

7. **Open the invoice PDF and read it.** Verify:
   - client-facing invoice number (`clientInvoiceNumber` / `unifiedInvoiceNumber`
     from `lib/invoices/invoice-status.ts`) and how it relates to
     `customer_invoice_number` from QA 12,
   - the status block and the label resolved by `resolveInvoiceStatusLabel`
     against the statuses configured in QA 04,
   - line descriptions (`describe-invoice-line.ts`),
   - commission folding (`fold-commission-line.ts`) — commission must not appear
     as a separate client-visible line if the design says it is folded,
   - unified totals (`build-unified-totals.ts`) reconciling to the quote total,
   - the banking block from QA 04's banking settings,
   - amount due, deposit amount, and balance,
   - no unrendered `{{tokens}}`.
8. Per the recorded business decision: **no VAT breakdown** on the client
   document. Confirm none appears.
9. `PATCH` the invoice to `sent` → status updates, and the
   `invoice_correspondence` gate from QA 12 is satisfied.
10. `PATCH` to `void` → the invoice no longer counts as live; a new one can be
    generated.
11. Storage: the PDF lands in the `invoices` bucket and a `documents` row points
    at it with a bucket-prefixed `storage_path`.

### Sending & reminders

12. Send the deposit invoice email. Confirm the PDF is attached and the
    correspondence row is written with kind `invoice`.
13. `POST /api/invoices/{id}/reminder` → reminder email prepared and a
    `payment_reminders` row created. `PATCH` behaviour confirmed too.
14. Multiple reminders → each recorded separately; confirm there is no unbounded
    duplicate-send loop.

### Payments

15. Record a **capture** for the deposit amount. Verify:
    - `payments` row with a positive amount,
    - `payment_recorded` audit entry,
    - `syncBookingPaymentState` ran.
16. Payment **method** is required; **reference** is required when
    `getPaymentReferenceRequired` says so — confirm both by omitting each.
17. A **zero** amount is rejected. A `capture` with a negative amount is
    rejected. A `refund` must be negative — confirm a positive refund is
    rejected.
18. `deposit_paid` flips to TRUE once the paid total reaches the deposit
    threshold (the deposit invoice amount, else the full invoice amount).
    `deposit_paid_at` is stamped on the **first** flip only.
19. `deposit_confirmed_manually` is **sticky** — it can be set true but never
    clears. Set it, then trigger a re-sync and confirm it survives.
20. Record a **partial** payment below the deposit threshold → `deposit_paid`
    stays false, balance reduces by exactly the amount paid.
21. Record the balance payment. Confirm:
    - `invoice_balance` reaches 0 (`calculate-balance.ts`: newest **accepted**
      quote total minus the sum of payments, floored at 0, rounded),
    - the booking **auto-advances to `final_paid`** with `final_paid_at` stamped
      and a `booking_paid_in_full` audit entry.
22. **Overpayment** — pay more than the total. Balance must floor at 0, not go
    negative. Record whether the overpayment is surfaced anywhere; a silently
    swallowed overpayment is Sev-2.
23. Record a **refund** (negative amount) → balance increases again. Confirm the
    booking's stage and `deposit_paid` react correctly, or record that they do
    not (a booking left in `final_paid` after a full refund is Sev-2).
24. `PATCH /api/payments/{id}` amends a payment. **Known risk: the PATCH route
    does not re-run `syncBookingPaymentState`.** Amend an amount and check
    whether `invoice_balance` and `deposit_paid` update. If they do not, that is
    a confirmed Sev-2 with a clean repro — write it up precisely.
25. `POST /api/jobs/{id}/payment-received` → regenerates the invoice PDF and
    prepares the payment-received email. Confirm the regenerated PDF shows the
    updated paid/balance figures.
26. Send the payment confirmation via `components/send-payment-confirmation-button.tsx`.

### Error paths

27. `calculate-balance.ts` **throws** when there is no accepted quote or the
    total is ≤ 0. Construct that on a throwaway booking and confirm the error is
    handled — a user-facing 500 with a raw message is Sev-2.
28. Record a payment on a booking with no invoice → what happens? Record it.

### Payment register

29. `/app/payments` (orphan route) — add a payment and allocate it to a booking
    from here. Confirm the allocation produces the same state as recording from
    the booking's Payments tab.
30. The register lists payments with the right booking, amount, method and date.

## Probes

- Two simultaneous payment posts for the same amount → do you get one payment or
  two? A double-recorded payment zeroing a balance twice is Sev-1.
- Post a payment, then void the invoice → what happens to the balance?
- A payment with a 3-decimal amount and one with a very large amount → rounding
  consistent with the quote total from QA 11 to the cent.
- `POST /api/payments` unauthenticated → 401.

## Report

`qa/reports/system-qa/{date}-13-invoicing-payments.md`

Extra sections:

- **Money ledger**: quote total → deposit % → deposit amount → each payment →
  running balance → final balance. Every figure worked by hand next to the
  system's figure. Any divergence is the headline finding.
- **Invoice PDF checklist** for check 7, item by item.
- **State table**: after each payment — `invoice_balance`, `deposit_paid`,
  `deposit_paid_at`, `deposit_confirmed_manually`, booking stage.

## Acceptance

- The QA booking reaches `invoice_balance = 0` and stage `final_paid`.
- Checks 4 (one live invoice), 21 (auto-advance) and 24 (PATCH re-sync) are
  conclusive.
- The money ledger reconciles end to end, or every divergence is written up.
