# QA 04 — Settings & Configuration

Read `@qa/prompts/system-qa/_preamble.md` first. Do not skip it.

## Goal

Every settings card must do three things: save, survive a reload, and **actually
change something downstream**. A setting that persists but has no effect is the
failure mode this prompt exists to catch — so each check pairs a settings change
with the artefact it is supposed to influence.

## Prerequisites

QA 01 GREEN. Run as admin (carmen). Do not reset.

## Surfaces under test

- [app/app/settings/page.tsx](../../../app/app/settings/page.tsx) (~2200 lines, one scrolling column of cards)
- [lib/settings-access.ts](../../../lib/settings-access.ts) — the server contract and the setting-key groups
- `app/api/settings/*` — one route per card
- [app/app/settings/rate-types/page.tsx](../../../app/app/settings/rate-types/page.tsx), [lib/rate-types/supplier-rate-tiers.ts](../../../lib/rate-types/supplier-rate-tiers.ts)
- [lib/pipeline/constants.ts](../../../lib/pipeline/constants.ts) — `DEFAULT_DEPOSIT_PERCENTAGE`, `calculateDepositAmount`

## Checks

For every card: change a value → save → **reload the page** → value persisted →
then verify the downstream effect named below. Screenshot before and after.

| # | Card | Downstream effect to verify |
|---|---|---|
| 1 | Company Information | Company name appears on `/login` (via `/api/branding`) and in generated PDFs |
| 2 | Company logo (admin only) | Upload a logo → appears on `/login` and in the PDF brand block; delete → falls back cleanly, no broken image |
| 3 | Banking Details | Values render in the invoice PDF banking block and resolve the `{{bankingDetails}}` email token (`lib/invoices/banking-details-block.ts`) |
| 4 | Invoice Statuses | Custom status labels appear in the invoice header and in the status picker; system vs manual statuses behave differently |
| 5 | Quote & Invoice Defaults — deposit % | Change from 25 to 30 → generate a deposit invoice on a booking → amount is 30% of the accepted quote total (`calculateDepositAmount`) |
| 6 | Quote & Invoice Defaults — refundability + quote defaults | Wording appears on the generated quote PDF |
| 7 | Default Commission | Switch % markup ↔ fixed total → new quote line prices change accordingly (`lib/pricing/default-commission.ts`) |
| 8 | Hotel Defaults | Default check-in/check-out times prefill on a hotel leg (`lib/suppliers/hotel-default-times.ts`) |
| 9 | Quote Validity (behind `QUOTE_VALIDITY_ENABLED`) | Change validity days → a newly created quote's `valid_until` reflects it. Confirm the 14-day default from CLAUDE.md is the shipped default |
| 10 | Train Pricing Defaults — child price ratio (admin only) | A train leg with children prices children at the configured ratio |
| 11 | Passenger Age Bands (admin only) | Change a band boundary → `GET /api/jobs/{id}/passenger-totals` re-buckets a traveller who sits on the boundary |
| 12 | Session Timeout | Already exercised in QA 02 — here only confirm persistence and that the value reaches `lib/session-timeout.ts` |
| 13 | Quote Follow-Up | Enable + set cadence → the follow-up worker picks up a sent quote at the right interval (assert the query in `lib/quotes/follow-up-worker.ts`; the cron run itself is QA 18) |
| 14 | Rate Types (`/app/settings/rate-types`) | See the dedicated section below |
| 15 | Error Log link | Navigates to `/app/settings/error-log` and the page loads |
| 16 | Customer Data link | Navigates to `/app/settings/customer-import` (import itself is QA 05) |
| 17 | System card | App version matches `lib/version.ts`; data mode and email provider are accurate; non-admins see the degraded copy |
| 18 | Backups (behind `BACKUPS_ENABLED`) | Record whether the flag is on. If off, mark **not covered** and move on — do not enable it |

### Rate types (check 14, expanded)

19. Create a rate type, edit it, archive it. Archived types disappear from
    pickers but existing references still render.
20. **Precedence.** `lib/rate-cards/resolve.ts` resolves a quote line's rate card
    in the order: the leg's own explicit choice → the supplier's quoted rate →
    the supplier's base rate → the global `isDefault`. Construct all four
    situations and confirm the rate type on each priced line. Getting this wrong
    prices bookings incorrectly, so treat any mismatch as Sev-2.
21. **Hard vs soft.** A rate picked by hand on a leg is a contract: if it has no
    rate card for that route/suite/date the build must fail naming that rate. A
    supplier's starred quoted rate is inherited, so the same gap must instead
    fall through to the base rate with `pricing_snapshot.rateTypeInherited` true.
    Verify both directions — they are the reason the base/quoted split exists.
22. The Rate Types link is only rendered for `edit:settings` (admin); the API
    returns `canEdit`. Confirm a manager hitting the URL directly gets a
    read-only view, not an editable one.

## Probes

- Submit an out-of-range value to each numeric setting (deposit −5 and 150,
  validity 0 and 9999, child ratio 2.5, age band max < min). Each must be
  rejected by Zod at the API with a 400 and a usable message — not silently
  clamped, not accepted.
- Save two cards concurrently (two tabs) and confirm neither clobbers the other's
  keys. `lib/settings-access.ts` groups keys (`DOCUMENT_TEXT_SETTING_KEYS`,
  `BANKING_SETTING_KEYS`, …) — a group write that wipes a sibling group's keys is
  Sev-2.
- Empty every optional field on the Banking card and regenerate an invoice PDF —
  the banking block must degrade, not render `undefined` or crash the render.

## Restore state

This prompt changes global configuration that prompts 05–19 depend on. **Restore
every value you changed to its original before finishing**, and confirm the
restore in the report. Record the original values in a table at the top of the
report before you touch anything.

## Report

`qa/reports/system-qa/{date}-04-settings-configuration.md`

Extra sections:

- **Original values table** captured before any change.
- **Setting → effect table:** card · field · new value · downstream artefact
  checked · effect observed? (yes/no/not-wired).
- **Restored?** explicit confirmation per changed setting.

## Acceptance

- Every card in `app/app/settings/page.tsx` has a row, including ones you could
  not test (marked with the reason).
- Rate type precedence tested at all four levels.
- All settings restored, confirmed in writing.
