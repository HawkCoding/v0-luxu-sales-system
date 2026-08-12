# QA 07 — Legacy Catalogue Packages (data-only)

Read `@qa/prompts/system-qa/_preamble.md` first. Do not skip it.

## Goal

Catalogue packages were the old reusable multi-leg itinerary templates. The
admin surface that created and applied them (`/app/packages`, the package
wizard, `/api/packages/**`, `POST /api/packages/{slug}/apply`) **has been
deleted** — Build Booking replaced it, and that flow is covered by QA 10.

What survives is data, not UI: the `packages`, `package_legs` and
`package_leg_routes` tables still hold rows that pre-cutover bookings point at.
This pass verifies those legacy bookings still render correctly everywhere their
package data is read. There is nothing to create here and no wizard to walk.

## Prerequisites

QA 06 complete (supplier, routes, rate cards). A booking that predates the Build
Booking cutover — one with `bookings.package_id` set and rows in
`booking_package_selections`. In the seed those are `LTT-2025-0007`
(voucher_sent), `LTT-2026-0021` (deposit_requested) and `LTT-2026-0030`
(quote_sent).

Find them with:

```sql
SELECT b.booking_number, b.stage, count(s.id)
FROM bookings b JOIN booking_package_selections s ON s.booking_id = b.id
GROUP BY 1, 2;
```

## Surfaces under test

- [lib/voucher/build-service-blocks.ts](../../../lib/voucher/build-service-blocks.ts) — reads `booking_package_selections` joined to `package_legs(sort_order, label)` for legacy bookings, and `booking_services` for Build Booking ones. A booking uses one or the other, never both.
- [lib/quotes/accepted-quote-scope.ts](../../../lib/quotes/accepted-quote-scope.ts) — resolves accepted-quote leg scope across both tables
- [lib/invoices/build-invoice-view.ts](../../../lib/invoices/build-invoice-view.ts), [lib/worksheet/build-worksheet-view.ts](../../../lib/worksheet/build-worksheet-view.ts) — join `packages(name)` via `bookings_package_id_fkey`
- [app/api/customers/[id]/route.ts](../../../app/api/customers/[id]/route.ts) — same join on the customer's booking list
- [lib/packages/recompute-trip-dates.ts](../../../lib/packages/recompute-trip-dates.ts) — branches on `booking.package_id`

Reference package in the seed: `blue-train-five-night-package`
(`7af631c8-99ff-4eff-8964-96971736278f`) — train, two transfer legs, hotel, tour
and flight legs.

## Checks

1. **Voucher, legacy path** — generate the voucher for `LTT-2025-0007`. Every
   service block renders: supplier, dates, times, suite labels, leg order. Leg
   order must follow `package_legs.sort_order`. A missing or misordered block is
   Sev-1.
2. **Voucher, both paths agree** — compare that voucher against one generated
   for a Build Booking booking. Same structure, same field coverage. Divergence
   in what each path can render is Sev-2 and should be recorded field by field.
3. **Invoice** — open an invoice for a legacy booking. The package name prints
   (it comes from the `packages(name)` join, not from the booking). A blank
   package name where one is set in the DB is Sev-2.
4. **Worksheet** — same check on the worksheet view.
5. **Customer detail** — the customer's booking list shows the package name for
   legacy bookings.
6. **Accepted-quote scope** — for a legacy booking with an accepted quote,
   confirm the voucher only includes legs that were in the accepted quote
   version, and that the scope resolves off `booking_package_selections`.
7. **Trip dates** — confirm `recompute-trip-dates` still derives the trip range
   for a legacy booking (it takes the `package_id` branch).
8. **No orphan UI** — `/app/packages`, `/app/packages/{slug}`, `/api/packages`
   and `/api/jobs/{id}/package-selections` must all 404. A surviving route is
   Sev-3 (dead code shipped), a surviving *working* one is Sev-2.

## Probes

- Confirm nothing in the app writes to `packages`, `package_legs` or
  `booking_package_selections` any more. Build Booking must write only to
  `booking_services` / `booking_service_units`. A new row appearing in a legacy
  table during QA 10 is Sev-1 — it means the two models are being mixed on one
  booking, which `build-service-blocks.ts` explicitly does not support.
- Take a legacy booking through a stage transition and re-generate its voucher.
  It must not silently switch to the `booking_services` path and come back empty.

## Report

`qa/reports/system-qa/{date}-07-packages.md`

Extra sections:

- **Legacy booking inventory**: booking number · stage · selection count ·
  package name · voucher renders?
- **Path comparison**: the legacy voucher and the Build Booking voucher side by
  side, field by field.

## Acceptance

- Check 1 and check 3 pass — vouchers and invoices for pre-cutover bookings are
  intact.
- Check 8 confirms the catalogue UI and API are genuinely gone.
- The probe on mixed writes is conclusive.
