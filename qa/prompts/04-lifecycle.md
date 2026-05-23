# Phase 4 — Job Lifecycle QA (enquiry → voucher_sent)

## Goal
Walk the booking pipeline end-to-end using the supplier + package + customer
from `qa/.run-state.json`, capturing every broken guard, missing PDF, or stage
that can't be reached through the UI. Failure handling is
**capture–continue–report**: every gap is screenshotted and logged, and a
service-role workaround pushes the booking forward so later stages still get
tested. This is the most diagnostic phase in the suite.

## Pre-requisites
- Phases 1–3 have run successfully and populated `qa/.run-state.json` with
  `supplier`, `package`, and `customer` entries.
- If any of those are missing, mark Phase 4 **BLOCKED on Phase {1,2,3}** in
  the report and skip the test (do not invent fixtures).

## Mandatory patterns (from Phase 1–2 lessons)
Read these before writing the spec. Skipping them will cost you a day.

1. **Use the shared helpers in [qa/lib/forms.ts](../lib/forms.ts)**:
   - `labeledInput(scope, "Field name")` — for any shadcn form whose
     `<Label>` is not `htmlFor`-associated. Confirmed needed in the package
     wizard; likely needed in the stage-transition modal, deposit invoice
     dialog, and payment recording form.
   - `saveAndWaitFor(page, /\/api\/.../, "POST" | "PATCH", trigger)` — never
     use `waitForLoadState("networkidle")` after a save. Phase 2's active
     toggle silently failed for exactly this reason.
   - `fillBuffered` / `fillNumericField` — for buffered NumericInput fields
     (the booking pax inputs use this component).

2. **`<CardTitle>` is a `<div>`, not a heading.** Do not use
   `getByRole("heading", ...)` for card titles. Use `getByText` and scope to
   the surrounding card via `.locator(...).filter({ has: ... })`.

3. **Reload after every persisted change before asserting DB state.** The
   SWR cache will return stale data otherwise.

4. **Every `forceAdvanceStage` call is a Sev-1 or Sev-2 issue.** Log the
   workaround AND the reason it was needed.

## Spec
- Driver: `qa/specs/04-lifecycle.spec.ts` (to be written).
- Run isolated: `pnpm qa:phase '04-lifecycle'`.
- Authenticated via `ADMIN_STORAGE_STATE`.

## Surfaces under test
- Booking detail: [app/app/bookings/[id]/page.tsx](../../app/app/bookings/[id]/page.tsx)
  / [app/app/jobs/[id]/page.tsx](../../app/app/jobs/[id]/page.tsx)
- Stage transitions: [lib/pipeline/validate-transition.ts](../../lib/pipeline/validate-transition.ts),
  [components/stage-transition-modal.tsx](../../components/stage-transition-modal.tsx)
- Quotes: [app/api/quotes/route.ts](../../app/api/quotes/route.ts),
  [components/create-quote-dialog.tsx](../../components/create-quote-dialog.tsx),
  [lib/quotes/quote-number.ts](../../lib/quotes/quote-number.ts)
- Deposit invoice: [app/api/invoices/deposit/route.ts](../../app/api/invoices/deposit/route.ts),
  [components/generate-deposit-invoice-dialog.tsx](../../components/generate-deposit-invoice-dialog.tsx)
- Payments: [app/api/payments/[id]/route.ts](../../app/api/payments/[id]/route.ts),
  [components/job-payments-tab.tsx](../../components/job-payments-tab.tsx)
- Final invoice: [app/api/invoices/final/route.ts](../../app/api/invoices/final/route.ts)
- Voucher: [app/api/vouchers/[id]/send/route.ts](../../app/api/vouchers/[id]/send/route.ts),
  [lib/voucher/render-pdf.ts](../../lib/voucher/render-pdf.ts)

## Scenario — capture-continue-report
Each stage is a sub-test. A failure at stage N must NOT abort stages N+1+; log
the gap, optionally call `forceAdvanceStage(bookingId, toStage, reason)` from
[qa/lib/db-bypass.ts](../lib/db-bypass.ts), and continue.

1. **enquiry** — create booking for the Phase 3 customer with the Phase 2
   package, travel dates `2026-09-12 → 2026-09-16`, 2 adults, leisure,
   website source. Capture `BT-2026-####`.
2. **enquiry → quote_sent** — create quote `…-Q1`, send it, transition stage.
   If a PDF is supposed to be generated, flag missing PDFs.
3. **Quote revision** — revise to Q2 (e.g. 3 adults), confirm Q1 is preserved.
4. **quote_sent → accepted** — exercise the stage-transition modal's
   "at least one quote sent or accepted" guard.
5. **accepted → deposit_requested** — verify customer-completeness guard
   passes (name/email/phone/country were filled by Phase 3). Generate deposit
   invoice at the default 25% from `app_settings`. Send it.
6. **deposit_requested → deposit_paid** — record a payment matching the
   deposit total, attached to the deposit invoice. Verify `deposit_paid = TRUE`.
   **Probe:** try to skip past `deposit_paid` without recording the payment;
   the UI must block this per CLAUDE.md.
7. **booking_made** — flag the README-vs-enum discrepancy if the system has
   no explicit `booking_made` stage.
8. **→ final_paid** — generate final invoice for the balance, send it, record
   the balance payment, verify `invoice_balance = 0`.
9. **final_paid → voucher_sent** — generate voucher PDF, verify storage upload
   and `documents` row, send voucher. Probe: try generating the voucher
   before `invoice_balance = 0` and confirm the guard blocks it.
10. **voucher_sent → closed** (optional) — confirm no further transitions
    are possible.

## Report (`qa/reports/{date}-04-lifecycle.md`)
- A **stage-by-stage table**: stage, expected guard, actual behaviour,
  screenshot, result (✅ / ⚠️ workaround / ❌).
- Every place we called `forceAdvanceStage` — bookingId, target stage, reason.
- A document checklist: quote PDFs (Q1, Q2), deposit invoice PDF, final
  invoice PDF, voucher PDF. Link or "missing" for each.
- All console errors and 4xx/5xx network responses captured by
  `attachBrowserDiagnostics`.
- A **demo-readiness summary** at the bottom: green / yellow / red per stage.

## Acceptance
- `pnpm qa:phase '04-lifecycle'` produces `qa/reports/{today}-04-lifecycle.md`.
- The booking reached the furthest stage it could without invariants being
  violated; every shortcut taken is documented.
- The summary at the bottom is enough for Phase 5 to triage without re-running.
