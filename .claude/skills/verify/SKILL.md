---
name: verify
description: Runtime verification recipe for this repo — build, launch, login, drive booking/quote flows via authenticated API, capture client-facing output.
---

# Verify — Luxus Sales System

## Prereqs
- Local Supabase must be up (`docker ps | grep supabase`); if migrations changed: `pnpm db:reset` (applies migrations + seed.sql), `pnpm run db:types`.
- Dev server: `pnpm dev` → http://localhost:3000 (ready in ~3s).

## Auth handle
Login through the real form with Playwright (`@playwright/test` is a dev dep — resolve it via `createRequire("<repo>/package.json")` when the script lives outside the repo):
- `/login`, fill `input[type=email]` / `input[type=password]`, click `button[type=submit]`, wait for URL `/app`.
- Seed user: `dirk@luxustravel.co.za` / `password123` (manager clearance).
- After login, `page.request.*` carries the session cookies — drive any `/api/*` route with it.

## Useful seed data (supabase/seed.sql — production-sourced catalog as of 2026-07-23)
- Booking in `enquiry` stage: `00000000-0000-0000-0000-000000009002` (2 adults, 0 children).
- Package `blue-train-five-night-package` (`7af631c8-99ff-4eff-8964-96971736278f`): train leg `1631c0a8-...` (The Blue Train, route `a409fa56-...` Pretoria↔Cape Town), transfer legs `5bd4c566-...`/`c68f1ea0-...` (Ulysses Tours & Transfers), hotel leg `18da3cc2-...` (The President Hotel), tour leg `569ef307-...` (City Sightseeing Bus Tours), flight leg `54e9d8bd-...` (FlySafair). Per-vehicle transfer pricing isn't in the prod pull (`supplier_pricing_options` was empty) — re-derive current pricing config from the app before relying on specific transfer prices.

## Quote flow via API (mirrors apply-package-dialog)
1. `POST /api/jobs/{id}/start-quote` `{}` → `quote.id`.
2. `POST /api/jobs/{id}/package` `{ packageId }` — seeds selections for all legs (`selected: true`).
3. `PATCH /api/jobs/{id}/package-selections` — send EVERY leg you care about; train legs are required by pricing (need `routeId`, `serviceDate`, and on apply: `units` summing to booking pax).
4. `PUT /api/jobs/{id}/transport-requests` — full replace-set.
5. `POST /api/packages/{slug}/apply` `{ jobId, quoteId, travelDate, selections }` → returns (does NOT persist) `lineItems`. Non-optional legs (train) must be configured or it 400s.
6. `PATCH /api/quotes/{quoteId}` `{ lineItems }` — persists lines (each needs `total`).
7. `POST /api/quotes/{quoteId}/email-preview` `{}` → JSON with client-facing HTML (grep it for itinerary lines). Requires persisted line items.

## Gotchas
- `app/api/quotes/[id]/route.ts` is UTF-16 on disk — Grep reports "binary file"; use Read.
- Local DB is disposable; verification data on seeded bookings is fine to leave.
