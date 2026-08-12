# QA 01 — Environment & Smoke

Read `@qa/prompts/system-qa/_preamble.md` first. Do not skip it.

## Goal

Prove the system starts clean from a database reset, that all four roles can log
in, and that every route in the application renders without a console or network
error. This is the gate for the other eighteen prompts — if this is RED, stop.

## Prerequisites

None. **This is the only prompt that runs `pnpm db:reset`.**

## Surfaces under test

- Bring-up: `package.json` scripts, `supabase/seed.sql`, `scripts/start-next-dev.mjs`
- Shell: [app/layout.tsx](../../../app/layout.tsx), [app/app/layout.tsx](../../../app/app/layout.tsx) (server auth gate), [app/app/client-layout.tsx](../../../app/app/client-layout.tsx) (sidebar + `navItems`)
- Login: [app/login/page.tsx](../../../app/login/page.tsx), [app/api/branding/route.ts](../../../app/api/branding/route.ts)
- Version: [lib/version.ts](../../../lib/version.ts)

## Checks

1. **Docker + reset.** `docker ps` shows Supabase containers. Run `pnpm db:reset`
   and capture the output. Any migration error is Sev-1, full stop.
2. **Type drift.** `pnpm run db:types` then `git status` — if `lib/supabase/types.ts`
   changes, generated types were stale on the branch. Sev-2. Revert the file.
3. **Seed baseline.** Query the DB: expect 18 customers, 9 bookings, 7 quotes,
   20 quote_line_items, 9 invoices, 7 payments, 15 suppliers, 1 package,
   5 profiles. Record the actual counts — later prompts reference them.
4. **Dev server.** `pnpm dev` reaches ready. Note the startup time and any
   warnings printed on boot.
5. **Unauthenticated branding.** `GET /api/branding` with no cookies returns 200
   with company name + logo. It is intentionally public — confirm it leaks
   nothing beyond branding.
6. **Unauthenticated redirect.** Visit `/app`, `/app/bookings`, `/app/settings`
   with no session. Each must redirect to `/login`.
7. **Root redirect.** `/` redirects to `/login`.
8. **Login, all seeded users.** Log in as carmen, dirk, leonie, douwlien in turn.
   Each reaches `/app`. Screenshot the sidebar for each — admin, manager and
   consultant must differ (leonie and douwlien are both consultants and must
   match), and you will reuse these screenshots in QA 03.
9. **Version display.** The version shown in the UI matches `APP_VERSION` in
   `lib/version.ts`. Mismatch is Sev-3.
10. **Every sidebar route renders.** As admin, visit each entry in `navItems`.
    For each: page paints, no unhandled console error, no 4xx/5xx in the network
    log, loading state resolves. Screenshot each.
11. **Orphan routes.** These exist but are not linked from the sidebar. Visit each
    by direct URL and record whether it renders, errors, or 404s:
    - `/app/settings/outcome-reasons` (linked from the Settings page)
    - `/app/quotes` (deleted — must 404; quotes are reached from the booking
      detail Quotes tab only)
    - `/app/payments` (reachable only from dashboard stat cards)
    - `/app/packages` (deleted — must 404; a rendering page means the catalogue
      surface was not fully removed)

    A route with no reachable entry point is at least Sev-3 — decide per route
    whether it is dead code or a missing nav item, and say which in the finding.
12. **Detail routes.** Open one booking, one customer and one supplier detail
    page from the seed data. Each renders with real data.
13. **Deep links.** `/app/jobs/{id}?tab=quotes` and each of the ten tab values
    (`enquiry`, `quotes`, `reservation`, `references`, `payments`,
    `correspondence`, `documents`, `attachments`, `notes`, `audit`) selects the
    right tab on load. Parser: `parseJobDetailTab` in `app/app/jobs/[id]/page.tsx`.
14. **Not-found + error boundaries.** Visit `/app/bookings/00000000-0000-0000-0000-000000000000`
    and a nonsense path. Confirm a handled not-found, not a stack trace.
15. **Logout.** Logout returns to `/login` and the session is dead (re-visiting
    `/app` redirects).

## Probes

- Hard-refresh a deep route (`/app/jobs/{id}?tab=payments`) — server render must
  not flash unauthenticated content before the gate applies.
- Open two tabs as the same user; confirm no session conflict.

## Report

`qa/reports/system-qa/{date}-01-environment-smoke.md`

Extra sections required beyond the standard contract:

- **Route inventory table:** route · renders? · console errors · network errors ·
  screenshot. Every route, including the orphans.
- **Seed baseline table:** table · expected count · actual count.
- **Boot warnings:** anything printed by `pnpm dev` or `pnpm db:reset` that is
  not a clean success line.

## Acceptance

- All four roles logged in and screenshotted.
- Every route in `navItems` plus the four orphan routes has a row in the route
  inventory table.
- Seed baseline counts recorded, because prompts 05–07 compare against them.
- Verdict stated. RED here means do not run prompts 02–19 until fixed.
