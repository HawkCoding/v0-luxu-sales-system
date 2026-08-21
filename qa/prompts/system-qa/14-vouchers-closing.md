# QA 14 — Vouchers, Itinerary, Worksheet & Closing

Read `@qa/prompts/system-qa/_preamble.md` first. Do not skip it.

## Goal

The voucher is what the guest actually travels on. It may only exist when the
booking is paid in full and every supplier reference is in place, and it must
render the *accepted quote's* services — not a stale earlier revision. This pass
takes the QA booking from `final_paid` through `voucher_sent` to `closed`.

## Prerequisites

QA 13 (QA booking at `final_paid`, `invoice_balance = 0`). QA 10 (supplier
schedules and station addresses recorded). QA 11 (Q2 accepted — check 24 there
scoped documents to it).

## Surfaces under test

- [lib/voucher/check-readiness.ts](../../../lib/voucher/check-readiness.ts) — the hard gate
- [app/api/voucher/generate/route.ts](../../../app/api/voucher/generate/route.ts), [app/api/vouchers/[id]/prepare-send/route.ts](../../../app/api/vouchers/[id]/prepare-send/route.ts)
- [lib/generate-voucher.ts](../../../lib/generate-voucher.ts), [lib/voucher/render-pdf.ts](../../../lib/voucher/render-pdf.ts), `lib/voucher/pdf/*` (tokens, styles, density, page-breaks)
- [lib/voucher/build-service-blocks.ts](../../../lib/voucher/build-service-blocks.ts), [service-block-rows.ts](../../../lib/voucher/service-block-rows.ts), [leg-references.ts](../../../lib/voucher/leg-references.ts)
- [app/api/jobs/[id]/leg-references/route.ts](../../../app/api/jobs/[id]/leg-references/route.ts), [components/job-references-tab.tsx](../../../components/job-references-tab.tsx) ("Voucher Details" tab)
- [lib/itinerary/build-itinerary.ts](../../../lib/itinerary/build-itinerary.ts), [render-pdf.ts](../../../lib/itinerary/render-pdf.ts), [ensure-itinerary-pdf.ts](../../../lib/itinerary/ensure-itinerary-pdf.ts), [sort-blocks.ts](../../../lib/itinerary/sort-blocks.ts), [default-trip-title.ts](../../../lib/itinerary/default-trip-title.ts)
- [app/api/jobs/[id]/worksheet/route.ts](../../../app/api/jobs/[id]/worksheet/route.ts), [lib/worksheet/build-worksheet-view.ts](../../../lib/worksheet/build-worksheet-view.ts), [render-worksheet-pdf.ts](../../../lib/worksheet/render-worksheet-pdf.ts)
- [components/generate-voucher-dialog.tsx](../../../components/generate-voucher-dialog.tsx), [lib/quotes/accepted-quote-scope.ts](../../../lib/quotes/accepted-quote-scope.ts)

## Checks

### Readiness gate — test every blocker

`lib/voucher/check-readiness.ts` blocks on: stage ∈ {`final_paid`,
`voucher_sent`, `closed`}, **`invoiceBalance === 0`**, departure date present,
customer email present, all leg references present, and no accepted-quote leg
missing from the builder. Construct each failure **individually** on a throwaway
booking or by temporarily breaking the QA booking and restoring it.

1. Stage earlier than `final_paid` → blocked.
2. **Non-zero balance** → blocked. This is the CLAUDE.md rule "voucher is only
   available when `invoice_balance = 0`". Record a partial refund to create a
   balance, attempt generation, confirm the block, then restore. A voucher
   generated with money outstanding is Sev-1.
3. No departure date → blocked.
4. No customer email → blocked.
5. A missing leg reference → blocked, naming the leg.
6. An accepted-quote leg absent from the voucher builder → blocked. This is the
   one that prevents a guest travelling on an incomplete voucher.
7. **Warnings, not blocks**: missing supplier contact, missing supplier address,
   missing service times, missing guest counts, missing flight details. Each must
   appear as a warning and must **not** prevent generation. A warning that blocks
   (or a blocker that only warns) is Sev-2 either way.

### Leg references

8. `GET /api/jobs/{id}/leg-references` lists every leg needing a supplier
   reference. `PATCH` sets them. Reload, persisted.
9. Enter references for every leg on the QA booking.
10. Blank/whitespace reference → treated as missing by the readiness check.
11. The "Voucher Details" tab surfaces which references are still outstanding.

### Voucher generation

12. `POST /api/voucher/generate` → service blocks built
    (`build-service-blocks.ts`), PDF rendered, stored in the `vouchers` bucket,
    `documents` row with `kind='voucher_pdf'`.
13. **Open the voucher PDF and read it.** Verify:
    - the guest's name and the traveller roster from QA 10,
    - booking reference and per-leg supplier references from check 9,
    - every service from the **accepted quote (Q2)** — and nothing from Q1
      (`lib/quotes/accepted-quote-scope.ts`),
    - dates and times matching the supplier schedules recorded in QA 10,
    - **per-city station addresses** from QA 06 check 7 rendering on the right
      legs,
    - branding, colours and section order from the voucher template (QA 16),
    - the wording configured in Templates → Guest Docs,
    - no unrendered `{{tokens}}`, no orphaned headings, no block split across a
      page break mid-row — the expected page-break behaviour is specified in
      [lib/voucher/pdf/page-breaks.test.ts](../../../lib/voucher/pdf/page-breaks.test.ts),
      read it before judging.
14. Regenerate after changing a supplier schedule time → the new time appears
    (no stale cached PDF).
15. Density/styles: generate a voucher for a booking with many legs and confirm
    the layout holds (`lib/voucher/pdf/density.ts`).

### Itinerary & worksheet

16. `POST /api/vouchers/{id}/prepare-send` → runs the readiness gate, composes
    the voucher email, and calls `ensureItineraryPdf`. Confirm the itinerary PDF
    is generated **silently** and attached — there is no standalone itinerary
    email by design (that was deliberately removed).
17. Open the itinerary PDF: block order from `sort-blocks.ts` is chronological,
    the trip title comes from `default-trip-title.ts` or the override, and the
    content matches the voucher.
18. `POST /api/jobs/{id}/worksheet` → internal worksheet PDF, `documents` row
    with `kind='summary_pdf'`, path `vouchers/<bookingNo>/worksheet-<bookingNo>.pdf`.
    It always re-renders — confirm.
19. Open the worksheet: it is the **internal** document, so confirm it contains
    the operational detail (costs, supplier references, margins) that must never
    appear on the guest voucher. Then confirm none of that internal detail leaks
    onto the voucher or itinerary. Internal cost data on a guest document is
    Sev-1.

### Sending & the stage move

20. Send the voucher email. Confirm:
    - the voucher PDF and the itinerary PDF are both attached,
    - a correspondence row of kind `voucher` is written.
21. The `voucher_correspondence` gate (block) and `voucher_document` gate
    (confirm, autofix `create_voucher_pdf`) from
    `lib/pipeline/validate-transition.ts` behave as specified — test the autofix
    path on a throwaway booking with no voucher PDF.
22. Move to `voucher_sent`. Confirm `apply-transition.ts` side effects:
    - `voucher_pdf` documents flip to `status='sent'`,
    - `outcome='Won'` and `outcome_set_at` stamped,
    - an `outcome_auto_set_won` audit entry,
    - the customer's `first_travel_date` / `last_travel_date` updated (compare
      against the values recorded in QA 05 check 14),
    - `voucher_sent_at` stamped.

### Closing (terminal — no reopening)

23. Move `voucher_sent → closed`. `closed_at` stamped, no gates fire.
24. From `closed`, attempt a forward move → nothing further exists; confirm the
    UI says so rather than offering a dead button.
25. **`closed` and `lost` are permanently terminal** (product decision, F12-4,
    2026-08-21 — no reopening, ever; the business rule is "start a new enquiry
    instead"). Confirm: any `PATCH stage=<anything else>` from `closed` returns
    400 `"This booking is closed and cannot be reopened. Start a new enquiry
    instead."`, and the same from `lost` returns the cancelled-booking variant
    of that message — in both cases even with `override: true` set (the rule
    is structural, not an overridable gate). Confirm `POST
    .../validate-stage-move` agrees (`failures: [{gateId: "terminal_stage"}],
    canOverride: false`). Confirm the UI shows no Back/Next control at all on
    a `closed` or `lost` booking.

## Probes

- Generate a voucher for a booking whose accepted quote was **revised after** the
  voucher was generated. Does the voucher go stale silently? Record it — this is
  the most likely real-world corruption path.
- Delete a `voucher_pdf` document, then attempt the `voucher_sent` transition →
  the autofix should offer to recreate it.
- `POST /api/voucher/generate` unauthenticated → 401.
- Generate two vouchers in quick succession → one document or two?

## Report

`qa/reports/system-qa/{date}-14-vouchers-closing.md`

Extra sections:

- **Readiness matrix**: condition · blocker or warning per the code · observed ·
  match?
- **Voucher content checklist** for check 13, item by item, with the PDF attached
  or its path recorded.
- **Internal-vs-guest leak check** (19) stated explicitly as pass/fail.
- **Side-effect table** for check 22.

## Acceptance

- The QA booking reaches `closed` with a sent voucher.
- All six blockers and all five warnings in the readiness matrix tested
  individually.
- Check 13's accepted-quote scoping (Q2 not Q1) proven.
- Check 19 conclusive.
