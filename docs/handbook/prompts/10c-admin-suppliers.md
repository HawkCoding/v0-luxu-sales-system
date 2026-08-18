# Step 10c — Administrator Guide, Chapter 3: Suppliers and rates

> Read `docs/handbook/_preamble.md` first, then do only this step.

**Model:** Opus 5 · **Effort:** medium-high
**Output:** `docs/handbook/content/admin/03-suppliers-and-rates.md`
**Screenshot slugs:** `a03-*` · new describe block `admin suppliers`

## Scope

The supplier catalogue and everything that feeds a price into a quote. Get this wrong and
consultants quote the wrong numbers, so it is worth the extra care.

## Source of truth — read these

- `app/app/suppliers/page.tsx`, `app/app/suppliers/[slug]/page.tsx`
- `components/supplier-detail-view.tsx`, `lib/supplier-editor-utils.ts`,
  `lib/supplier-save-guard.ts`, `lib/suppliers/`
- `app/api/suppliers/route.ts`, `/[slug]/route.ts`, `/quick/route.ts`
- `app/api/locations/route.ts`, `app/api/supplier-email-labels/route.ts`
- `lib/rate-cards/`, `lib/rate-card-validity.ts`, `lib/pricing/`
- `lib/suites/`, `lib/packages/suite-config.ts`
- The `supplier_pricing_options`, `supplier_seasonal_prices` and
  `supplier_rate_adjustments` tables in `lib/supabase/types.ts`

## Must cover

1. **The supplier directory** — search, and what a consultant sees versus an administrator.
2. **Supplier categories** — every kind the system supports (train operator, hotel
   property, transfer company, tour operator, airline and any others), and how the category
   changes the rest of the form. Note that hotel properties hide the bedroom and bathroom
   vocabulary.
3. **Adding a supplier** — every field, and what **Manage Locations** is for.
4. **Contacts and email addresses** — multiple addresses per supplier and what the labels
   are used for.
5. **Rate cards** — structure, validity windows, and what happens to a quote when a rate
   card expires.
6. **Seasonal pricing**
7. **Rate adjustments and price overrides** — including where a consultant can override a
   price on a single booking and how that is flagged on the quote.
8. **Suites and suite types** — how they map to what a consultant picks in Build Booking.
9. **Routes and locations** — for train and transfer legs.
10. **Linked suppliers** — multi-category suppliers, and what linking changes.
11. **Retiring a supplier** — what happens to bookings that already reference it.

## Screenshots to capture

| Slug | Shows |
|---|---|
| `a03-supplier-list` | The supplier directory |
| `a03-add-supplier` | The Add Supplier dialog with the category list open |
| `a03-supplier-detail` | A populated supplier record |
| `a03-rate-card` | A rate card with a validity window |
| `a03-seasonal` | Seasonal pricing |

## Done when

- Every supplier category is named and its form differences described.
- A reader can trace one price from the rate card to a quote line.
