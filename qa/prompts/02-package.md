# Phase 2 — Package Creation QA

## Goal
Drive the package wizard end-to-end using the supplier created in Phase 1, then
verify the resulting package round-trips through the database and the detail page.
Capture every wizard friction point and any field that fails to round-trip.

## Pre-requisites
- Phase 0 scaffolding in place (`pnpm qa` works against a freshly-reset DB).
- Phase 1 (`qa/specs/01-supplier.spec.ts`) has run successfully and written
  `supplier.id` + `supplier.slug` to `qa/.run-state.json`.
- The Phase 1 supplier has at least one route and one suite type attached.

If `qa/.run-state.json` is missing the supplier, Phase 2 must mark itself
**BLOCKED on Phase 1** in the report and skip; do not invent a supplier.

## Running
- `pnpm qa:phase '02-package'` — runs only Phase 2.
- `pnpm qa` — runs Phases 1 → 2 → 3 → 4 in order (file ordering is alphabetical
  and Playwright is configured with `workers: 1`).

## Surface under test
- Page: [app/app/packages/page.tsx](../../app/app/packages/page.tsx)
- Wizard: [components/package-wizard.tsx](../../components/package-wizard.tsx)
- Leg selector: [components/package-leg-selector.tsx](../../components/package-leg-selector.tsx)
- Detail view: [components/package-detail-view.tsx](../../components/package-detail-view.tsx)
- API: [app/api/packages/route.ts](../../app/api/packages/route.ts)
- Validation: [app/api/packages/schemas.ts](../../app/api/packages/schemas.ts)
- DB tables: `packages`, `package_legs`, `package_leg_routes`

## Scenario (cumulative — does NOT reset DB)
1. Read `qa/.run-state.json`. If `supplier.id` / `supplier.slug` are missing,
   mark Phase 2 BLOCKED, write a report, and skip the test.
2. Service-role-clean any pre-existing package whose name matches the fixture so
   the run is idempotent. Delete cascades: `package_leg_routes` →
   `package_legs` → `packages`.
3. Navigate to `/app/packages` and capture the page.
4. Click "New Package" to open the wizard Sheet.
5. **Step 1 — Details:** fill `name`, `durationNights`, `singleSupplementPct`,
   `fixedPricePerPerson` from `QA_RUN.package`. Currency defaults to ZAR which
   matches the fixture.
6. **Step 2 — Add Legs:** supplier-kind defaults to `train_operator` (matches
   Phase 1 supplier). Open the supplier dropdown — if the Phase 1 supplier is
   not present, this is a **Sev-1 gap**: log + screenshot + abort the phase.
   Otherwise select it and click "Add leg".
7. **Step 3 — Routes & Rates:** tick the checkbox for the Phase 1 route. The
   supplier has no rate cards yet, so the leg satisfies the "at least one
   selected route" rule but the indicative price range will be empty — that is
   fine because the package uses `fixedPricePerPerson` instead of rate cards.
8. **Step 4 — Review:** screenshot the review surface.
9. **Step 5 — Save:** click "Save package" and wait for the redirect to
   `/app/packages/<slug>`. Capture the slug.
10. **Reload the detail page** in the same tab to confirm the package
    round-trips from Postgres (catches "saves to memory but not DB" bugs).
    Assert: name, duration nights, single supplement %, and fixed price all
    show the fixture values.
11. **Toggle active:** flip the active switch off, save; flip it on again,
    save. Both saves must succeed because Phase 4 needs `active = true`.
12. **DB checks** via the service-role client:
    - `packages` row exists with correct slug, currency, duration nights,
      single supplement %, fixed price, and `active = true`.
    - At least one `package_legs` row links to `supplier.id` from
      `qa/.run-state.json`.
    - At least one `package_leg_routes` row exists for that leg.
13. **Persist** `package.id` and `package.slug` to `qa/.run-state.json` so
    Phase 4 can attach a job to this package.

## What the report must capture
- Friction per wizard step (anything that takes more than one obvious action,
  silent defaults, fields that lose focus on blur, etc.).
- Whether currency, duration, supplement %, and fixed price round-trip exactly
  on reload.
- Whether legs/routes are visible immediately on the detail page or only after
  a reload (SWR/cache bugs).
- Console errors and any 4xx/5xx network responses captured via
  `attachBrowserDiagnostics`.
- Service-role DB evidence: the raw `package`, `legs`, and `legRoutes` rows.

## Output
`qa/reports/{YYYY-MM-DD}-02-package.md`, plus screenshots under
`qa/screenshots/{YYYY-MM-DD}/02-package-*.png`.

## Done when
- The report exists with sections Goal / Environment / Steps / Database
  Evidence / Issues Found / Severity Summary.
- `qa/.run-state.json` now contains both `supplier` and `package` entries.
- Phase 3 (customer) can start with no manual setup.
