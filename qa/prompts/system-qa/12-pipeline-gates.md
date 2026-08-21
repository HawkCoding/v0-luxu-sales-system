# QA 12 — Pipeline Stage Machine (enquiry → deposit_requested)

Read `@qa/prompts/system-qa/_preamble.md` first. Do not skip it.

## Goal

The stage machine is the system's business-rule enforcement point. Every gate
must hold, every "confirm" gate must actually ask, and the manager override must
be both possible and auditable. This is the most diagnostic prompt in the suite —
budget time for it.

## Prerequisites

QA 11 (QA booking has a sent + accepted quote). You will also need one or two
**throwaway bookings** in early stages to test gates in isolation without
destroying the QA booking's progression — create them at the start.

Run as consultant for the gates, then as manager for the override.

## Surfaces under test

- [lib/pipeline/validate-transition.ts](../../../lib/pipeline/validate-transition.ts) — the gate definitions
- [lib/pipeline/apply-transition.ts](../../../lib/pipeline/apply-transition.ts) — side effects and timestamp stamping
- [app/api/jobs/[id]/route.ts](../../../app/api/jobs/[id]/route.ts) — the PATCH transition entrypoint and the `override` branch (~line 707)
- [app/api/jobs/[id]/validate-stage-move/route.ts](../../../app/api/jobs/[id]/validate-stage-move/route.ts) — dry-run
- [components/booking-stage-stepper.tsx](../../../components/booking-stage-stepper.tsx), [components/stage-transition-modal.tsx](../../../components/stage-transition-modal.tsx)
- [lib/pipeline/constants.ts](../../../lib/pipeline/constants.ts)

**Read `validate-transition.ts` before writing a single check** and reproduce its
gate table into the report. Everything below is measured against that file.

Ladder: `enquiry → quote_sent → accepted → deposit_requested → deposit_paid →
final_paid → voucher_sent → closed`, plus terminal `lost`. Only **forward** moves
are gated; backward and same-index moves return no gates. Gates are evaluated
over **every stage crossed**, so a skip runs all intermediate gates.

## Checks

### Global gates

1. **`customer_complete`** (block). Strip each of first name, last name, email,
   phone, country in turn from the customer and attempt a forward move. Each
   must block, and the message must name the missing field. Restore after each.
2. **`email_import_review`** (block). Already proven in QA 09 check 27 —
   re-confirm here on an email-sourced booking that the gate fires for
   `source='email'` + `email_import_needs_review` + no
   `email_import_review_resolved_at`, and that resolving it releases the move.

### Per-stage gates, in order

3. **`quote_sent_required`** (block, crossing `quote_sent`) — a booking with no
   quote in `sent` or `accepted` cannot move. Create a quote in draft only and
   confirm it does not satisfy the gate.
4. **`quote_sent_or_accepted`** (block, crossing `accepted` when `quote_sent`
   was not also crossed) — construct the case where a booking already sits in
   `quote_sent` and moves to `accepted`, and confirm which of the two gates
   evaluates.
5. **`reservation_form_received`** (block, crossing `accepted`) —
   `reservation_form_received_at` must be set. Confirm the block, then set it via
   `POST /reservation-received` (QA 10 check 27) and confirm release.
6. **`invoice_number_required`** (block, crossing `deposit_requested`) —
   `customer_invoice_number` non-empty. Confirm a whitespace-only value is also
   rejected.
7. **`invoice_document`** (**confirm**, autofix `create_invoice_25pct`, crossing
   `deposit_requested`) — satisfied by any of: a non-void `deposit`|`full`
   invoice, an `invoice_pdf` document, or the `manualConfirmations.createDepositInvoice`
   tick. Test **all three** paths separately:
   - none present → the modal asks for confirmation (it must *ask*, not block),
   - accept the autofix → an invoice is created at the configured deposit %
     (25 by default, per QA 04),
   - pre-existing invoice → gate satisfied silently.
8. **`invoice_correspondence`** (block, crossing `deposit_requested`) — fires
   only when an invoice exists but is not `sent`/`paid` and there is no *sent*
   correspondence of kind `invoice` or with subject containing "invoice" or
   "deposit request". Construct exactly that state and confirm the block, then
   send the invoice email and confirm release.

### Multi-stage skips

9. From `enquiry`, attempt a direct move to `deposit_requested`. **Every**
   intermediate gate (checks 3–8) must fire, not just the destination's. Confirm
   the modal lists all outstanding failures at once rather than one at a time.
10. From `enquiry` attempt a move to `closed`. Record what happens — `closed` has
    no gates of its own, so the intermediate gates are the only protection.

### Direction & aliases

11. **Backward moves are ungated.** Move the QA booking back a stage and confirm
    no gates fire and no timestamps are wrongly cleared. Record whether stamped
    timestamps (`quote_sent_at`, `accepted_at`) survive a backward move — a stale
    timestamp after going backward is at least Sev-3.
12. Same-stage "move" → no-op, no audit noise.
13. **Canonical aliases** (`CANONICAL_STAGE`): send `quoted`, `form_done`,
    `payment_schedule`, `trip_active` as target stages via the API and confirm
    each maps to `quote_sent`, `accepted`, `deposit_requested`, `voucher_sent`.
14. An unknown stage value → 400, not a silent no-op.

### Dry run parity

15. `POST /api/jobs/{id}/validate-stage-move` for each of the states above.
    The failures it returns must be **identical** to what the real PATCH
    produces. A dry run that disagrees with the real transition is Sev-2 —
    the modal is built on it.
16. Confirm the dry run writes nothing: snapshot the booking row before and
    after.

### Side effects (`apply-transition.ts`)

17. Timestamps stamped per crossed stage: `quote_sent_at`, `accepted_at`,
    `deposit_requested_at`. Verify each in the DB after the move.
18. Crossing `accepted` promotes the **newest `sent`** quote to `accepted` and
    then runs `syncBookingPaymentState`. With two sent quotes present, confirm
    the newest wins.
19. Crossing `deposit_requested` **with** the `createDepositInvoice` confirmation
    creates the `invoice_pdf` document, seeds `invoice_balance` from the quote
    total, and drafts a `deposit_request` correspondence. Without the
    confirmation, none of those three should happen — verify both branches.
20. `source='email'` bookings have `raw_text` cleared on any move off `enquiry`.
21. `pipeline_history` gains a row per transition with the right from/to and
    actor; the booking's Audit tab shows it.

### Concurrency

22. **`StaleTransitionError`** — the optimistic-concurrency guard on
    `updated_at`. Load the stage modal in two tabs, move the stage in tab A, then
    submit tab B. Tab B must fail with a stale-state error and must **not** apply
    a second transition. A double transition here corrupts the pipeline history —
    Sev-1 if it happens.
23. Two simultaneous PATCHes to the same booking → one wins, one errors cleanly.

### Override gates

Deliberate product decision (#122): any authenticated role, including consultant,
may override a blocked stage transition. There is no role gate on this path — the
control is the audit trail, not permission. Do not flag the absence of a role
check here; it is intentional.

24. As **consultant**, `override: true` on a blocked transition with a non-empty
    `overrideReason` → succeeds, and a `stage_change_override` audit entry is
    written naming the consultant as actor.
25. As **consultant** (or any role), `override: true` on a blocked transition with
    an empty `overrideReason` → rejected with 400.
26. `override: true` with a reason on a transition that has no failing gates →
    the move applies as a normal transition and **no** `stage_change_override`
    audit row is written (only the regular `stage_change` row). The override log
    should only ever contain real bypasses.
27. `override: true` with a reason on a blocked transition → the transition
    applies despite failing gates, and a `stage_change_override` audit entry is
    written containing the reason, the actor, and the gates it bypassed. Confirm
    the reason is stored, not just logged to the console.
28. Confirm the override is visible after the fact — an override must be
    discoverable in the booking's audit tab, not only in the global audit log.

### UI

28. The stage stepper shows the current stage, the reachable next stages, and
    disabled states with a reason on hover/focus — not just a greyed button.
29. The transition modal lists each failure with a human explanation and, where
    an autofix exists, an obvious way to apply it.
30. Confirm-severity gates render differently from block-severity gates. If a
    confirm gate is presented as a hard block (or vice versa), that is Sev-2.

## Probes

- Move a booking to `lost` from `enquiry` — the `lost` path short-circuits every
  other gate. Full lost/refund testing is QA 15; here just confirm the
  short-circuit and that `cancel_reason` is still required.
- Attempt a forward move on a **cancelled** booking.
- Attempt a transition via the API with a `jobId` the user cannot see → 403/404,
  never a leak of the booking's data in the error.

## Report

`qa/reports/system-qa/{date}-12-pipeline-gates.md`

Extra sections:

- **Gate table as implemented**, extracted from `validate-transition.ts`:
  crossed stage · gate id · severity · condition · autofix.
- **Gate results table**: gate · state constructed · fired? · severity observed ·
  message quality · release condition worked?
- **Dry-run parity table**: state · dry-run failures · PATCH failures · match?
- **Side-effect table**: stage crossed · timestamps stamped · records created ·
  matches `apply-transition.ts`?
- **Every `forceAdvanceStage` used**, with the reason.

## Acceptance

- Every gate in `validate-transition.ts` has a row in the gate results table.
- Multi-stage skip (check 9) proven to run intermediate gates.
- Dry-run parity confirmed for at least six distinct failure states.
- Override tested at all three role levels with the audit entry verified.
- The QA booking ends this prompt in `deposit_requested`.
