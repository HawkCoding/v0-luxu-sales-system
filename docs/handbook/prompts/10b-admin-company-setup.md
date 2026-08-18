# Step 10b — Administrator Guide, Chapter 2: Company setup

> Read `docs/handbook/_preamble.md` first, then do only this step.

**Model:** Sonnet 5 · **Effort:** medium
**Output:** `docs/handbook/content/admin/02-company-setup.md`
**Screenshot slugs:** `a02-*` · describe block `admin company setup` (already scaffolded)

## Scope

Every setting on the Settings page and its sub-pages, and — the part that matters — what
each one changes downstream.

## Source of truth — read these

- `app/app/settings/page.tsx` — every card
- `app/api/settings/*/route.ts` — one route per setting; read them for the real field names
  and validation rules
- `app/app/settings/rate-types/page.tsx`, `app/app/settings/outcome-reasons/page.tsx`
- `lib/pipeline/constants.ts` — the default deposit percentage
- `lib/quotes/validity.ts` — quote validity
- `lib/invoices/build-invoice-view.ts` — where company and banking details surface

## Must cover

Organise as one section per settings card. For each: what it is, the fields, and **where it
shows up** — that last part is what makes this chapter worth reading.

1. **Company information** — and that it prints on quotes, invoices and vouchers.
2. **Banking details** — and that they print on the invoice. Redact the account number,
   branch code and tax registration number in the figure using the `redact()` helper in
   `tests/qa/handbook-shots.fixtures.ts`; the field labels and positions stay visible.
3. **Invoice statuses**
4. **Quote and invoice defaults** — the default deposit percentage, and that a consultant
   can override it per booking at generation time.
5. **Default commission**
6. **Hotel defaults**
7. **Passenger age bands** — and the effect on pricing.
8. **Train pricing defaults** — including the child price ratio.
9. **Quote validity** — the default window.
10. **Quote follow-up** — timing, and the link to the Dashboard's follow-up queue.
11. **Session timeout**
12. **Rate types** — RAC, STO, NETT, Resident: what each means and where a consultant meets
    them.
13. **Outcome reasons** — the list behind the Lost and Cancelled dialog.
14. **System information** — what it reports and when to look at it.

> [!WARNING]
> Changing the deposit percentage or quote validity affects **new** quotes and invoices
> only. Confirm this in the code and state the answer explicitly either way.

## Screenshots to capture

| Slug | Shows |
|---|---|
| `a02-settings-landing` | The Settings page (already scaffolded) |
| `a02-company-info` | Company information card |
| `a02-banking` | Banking details card |
| `a02-deposit-default` | Quote and invoice defaults |
| `a02-rate-types` | The Rate Types page |

## Done when

- Every card on the Settings page appears in the chapter — none skipped.
- Each section answers "where does this show up?" in one sentence.
