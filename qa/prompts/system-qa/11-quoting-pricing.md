# QA 11 — Quoting, Pricing & Quote Documents

Read `@qa/prompts/system-qa/_preamble.md` first. Do not skip it.

## Goal

The quote is the first client-facing money document and the anchor for
everything after it — the invoice balance is computed from the *accepted* quote,
and the voucher is scoped to it. This pass verifies quote creation, pricing,
versioning, revision, validity and the rendered PDF.

## Prerequisites

QA 10 (QA booking has a confirmed service list and traveller roster).
Run as consultant (leonie).

## Surfaces under test

- [app/api/jobs/[id]/start-quote/route.ts](../../../app/api/jobs/[id]/start-quote/route.ts), [app/api/quotes/route.ts](../../../app/api/quotes/route.ts), [app/api/quotes/[id]/route.ts](../../../app/api/quotes/[id]/route.ts) *(UTF-16 on disk — use Read, not Grep)*
- `app/api/quotes/[id]/{pdf,email-preview,revise,cancel,commission-bonus}/route.ts`
- [components/job-quotes-tab.tsx](../../../components/job-quotes-tab.tsx), [components/create-quote-dialog.tsx](../../../components/create-quote-dialog.tsx), [components/quote-revision-banner.tsx](../../../components/quote-revision-banner.tsx), [components/quote-preview-send-dialog.tsx](../../../components/quote-preview-send-dialog.tsx)
- [lib/quotes/pricing-engine.ts](../../../lib/quotes/pricing-engine.ts) — `calculateQuoteTotals`, `isMissingPricing`, `isFixedPackageInclusion`
- [lib/quotes/quote-number.ts](../../../lib/quotes/quote-number.ts), [lib/quotes/quote-validity.ts](../../../lib/quotes/quote-validity.ts), [lib/quotes/revision-reset.ts](../../../lib/quotes/revision-reset.ts), [lib/quotes/apply-commission-bonus.ts](../../../lib/quotes/apply-commission-bonus.ts), [lib/quotes/accepted-quote-scope.ts](../../../lib/quotes/accepted-quote-scope.ts)
- [lib/quotes/adapters/from-booking-services.ts](../../../lib/quotes/adapters/from-booking-services.ts), [lib/quotes/price-extra-line.ts](../../../lib/quotes/price-extra-line.ts)
- [lib/pricing/commission.ts](../../../lib/pricing/commission.ts), [lib/pricing/rate-markdown.ts](../../../lib/pricing/rate-markdown.ts)
- [lib/quotes/render-quote-pdf.ts](../../../lib/quotes/render-quote-pdf.ts), [lib/quotes/ensure-quote-pdf.ts](../../../lib/quotes/ensure-quote-pdf.ts) (`QUOTE_BUCKET="quotes"`)

The API recipe in `.claude/skills/verify/SKILL.md` mirrors the Build Booking
dialog step by step — use it when the UI blocks you, and note in the report that
you did.

## Checks

### Creation & pricing

1. `POST /api/jobs/{id}/start-quote` → quote created, number `BT-YYYY-NNNN-Q1`
   (`lib/quotes/quote-number.ts`), validity stamped from `app_settings`
   (14 days per CLAUDE.md — confirm the actual value and its source).
2. Price the booking's services into lines via `/services/apply` or
   `/packages/{slug}/apply`, then persist with `PATCH /api/quotes/{id}
   { lineItems }`. Every line needs a `total` — confirm a line without one is
   rejected rather than persisted as null.
3. **Totals.** `calculateQuoteTotals` — verify the subtotal, commission and grand
   total by hand against the rate cards from QA 06. Record the arithmetic in the
   report. This is the single most important number in the system.
4. `isMissingPricing` — a line with no resolvable rate must be flagged, and the
   quote must not present a total as if it were complete. **A quote that totals
   as though a missing line were zero is Sev-1.**
5. `isFixedPackageInclusion` — confirm fixed inclusions are not double-counted
   against per-pax pricing.
6. Commission: percentage markup and fixed total (per QA 04/06 configuration)
   both produce the expected figure (`lib/pricing/commission.ts`).
7. `lib/pricing/rate-markdown.ts` — confirm the markdown/rate-type presentation
   matches the rate type resolved by QA 04's precedence rules.
8. Add an extra ad-hoc line (`lib/quotes/price-extra-line.ts`) — priced and
   included in the total.
9. Edit a line's quantity and unit price; the total recalculates immediately in
   the UI and matches the server after a reload.
10. Child and infant pricing on the quote matches the age buckets from QA 10
    check 20.

### Commission bonus

11. `PATCH /api/quotes/{id}/commission-bonus` while the quote is **provisional** →
    accepted, total updates.
12. Same call once the quote is no longer provisional → must be rejected.
    A commission bonus editable on a sent quote is Sev-2.

### Documents

13. `POST /api/quotes/{id}/pdf` → renders and stores in the `quotes` bucket at
    `quotes/<quoteNumber>/quote-<ref>.pdf`, and links `quotes.pdf_document_id`.
    Verify the storage object and the DB link.
14. **Open the PDF and read it.** Check: company branding and logo, quote number,
    validity date, customer details, every line item with the right description
    and amount, the grand total matching check 3, the wording from the Quote &
    Invoice Defaults in QA 04, and no placeholder tokens left unrendered
    (`{{…}}` visible in a client document is Sev-2).
15. Re-render after editing a line → the PDF reflects the change (confirm it is
    not serving a cached old file).
16. `POST /api/quotes/{id}/email-preview` → returns client-facing HTML. Grep it
    for the itinerary lines and confirm they match the service list from QA 10.
    Requires persisted line items — confirm it errors cleanly without them.

### Sending & acceptance

17. Send the quote via the Preview & Send dialog. Confirm the quote PDF is
    generated if missing, attached, and the quote status becomes `sent`.
18. The correspondence record is written and appears in the booking's
    Emails Sent tab and in `/app/correspondence`.
19. Accept the quote (via the stage move to `accepted` — QA 12 covers the gate).
    Confirm `applyTransition` promotes the **newest `sent`** quote to `accepted`
    and then runs `syncBookingPaymentState`.

### Revisions

20. `POST /api/quotes/{id}/revise` → creates `…-Q2`. Confirm:
    - Q1 is preserved and still viewable with its original lines and PDF,
    - Q2 starts from Q1's content,
    - `lib/quotes/revision-reset.ts` reset payments/lines as designed —
      state exactly what was reset.
21. Revision is only permitted after the draft stage — attempt it on a draft and
    confirm the block.
22. Change pax on Q2 (2 adults → 3) and re-price. Confirm the total changes and
    Q1 is untouched.
23. `components/quote-revision-banner.tsx` warns the user that a newer revision
    exists when viewing Q1.
24. Accept Q2. Confirm `lib/quotes/accepted-quote-scope.ts` now scopes downstream
    documents to Q2, not Q1 — this is what the voucher in QA 14 will render.

### Cancellation & validity

25. `POST /api/quotes/{id}/cancel` → voided; confirm a cancelled quote cannot be
    accepted and does not count toward the `quote_sent_required` gate.
26. Validity: set a quote's `valid_until` into the past (or wait it out with a
    short validity from QA 04). Confirm the expiry is visible to the consultant
    and on the client-facing document, and record whether an expired quote can
    still be accepted. If it can, that is a finding — say so.

## Probes

- `PATCH /api/quotes/{id}` with a negative total and with a 15-decimal-place
  amount → rejected or rounded deterministically. Compare against
  `lib/invoices/calculate-balance.ts` rounding so quote and balance cannot
  disagree by a cent.
- Persist line items on an `accepted` quote → must be blocked; editing an
  accepted quote out from under an issued invoice is Sev-1.
- Two consultants editing the same quote in two tabs → last-write-wins or
  conflict? Record it.
- `POST /api/quotes` unauthenticated → 401.

## Report

`qa/reports/system-qa/{date}-11-quoting-pricing.md`

Extra sections:

- **Pricing arithmetic**: line · qty · unit · rate card used · line total, then
  subtotal + commission + grand total, worked by hand and compared to the app.
- **Quote versions**: Q1 and Q2 numbers, totals, statuses, PDF paths.
- **PDF content checklist** for check 14, item by item.

## Acceptance

- The QA booking has an accepted quote with a non-zero total and a rendered PDF.
- Check 3 arithmetic shown in full.
- Checks 4, 12 and 24 conclusive.
