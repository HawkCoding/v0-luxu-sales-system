# Technical Handover Sheet

## What this system is

Luxus Sales System manages the full lifecycle of luxury rail travel bookings, from first
enquiry through to a paid, closed booking with a travel voucher issued. It is built and
run by Luxus Travel and Tours. Credentials and environment values are supplied to you
separately — nothing in this document will get you into a running environment.

## Stack

- **Next.js** 16.1.6, App Router only (no Pages Router) · **React** 19.2.4 · **TypeScript**
  5.7.3 in strict mode
- **Tailwind CSS** v4 with **Shadcn UI** components, `lucide-react` icons
- **Supabase** (Postgres + Auth + Storage)
- **SWR** for client-side data fetching, **Zod** for validation at API boundaries
- **Vitest** for unit tests, **Playwright** for QA and handbook screenshot capture
- **Node** 24.x, **pnpm** 10.30.3 — a `preinstall` script (`npx only-allow pnpm`) blocks
  `npm install` and `yarn` outright

## Repo layout

No `src/` directory. Top-level roots: `app/` (routes and API handlers), `components/`,
`lib/`, `hooks/`, `supabase/` (config and migrations), `tests/` and `qa/` (Playwright
suites), `scripts/` (operational tooling, mostly Node with some PowerShell).

Conventions: kebab-case filenames, named exports (default exports reserved for Next.js
page/layout files), Server Components by default — `"use client"` only where hooks,
events or browser APIs are required. Full conventions are in `CLAUDE.md` at the repo
root; this sheet does not repeat them.

## Third-party services

| Service | Purpose | Env var names (no values) |
|---|---|---|
| Supabase | Postgres database, Auth, Storage | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Resend | Transactional email sending | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| Per-salesperson cPanel SMTP | Outbound mail sent as the consultant's own mailbox | resolved per-user, see `lib/email/smtp-transport.ts` / `lib/email/resolve-sender.ts` |
| IMAP inbound mailboxes | Reads incoming mail to import enquiry threads | see `lib/inbound-email/` |
| Gravity Forms webhook | Public website enquiry form intake | `app/api/webhooks/gravity-forms` |
| Vercel | Hosting, cron scheduling | — |
| GitHub Actions | CI, migration automation | — |

## Running it locally

1. Docker Desktop must be running.
2. `pnpm install`
3. `pnpm db:start` — brings up the local Supabase stack.
4. `pnpm db:reset` — applies all migrations and seed data to the local database.
5. `pnpm dev` — starts Next.js on port 3000.

`pnpm local:start` does steps 3–5 together and injects the local Supabase URL/keys
automatically. `.env.local` is required for any values not supplied by `local:start`
(e.g. `RESEND_API_KEY`) and is provided to you separately, not part of this document.

## Database

Migrations live in `supabase/migrations/` — 203 files at the time of writing. Apply them
locally with `pnpm db:reset`. After changing schema, regenerate `lib/supabase/types.ts`
with `pnpm db:types`. Check for drift against the hosted development and production
databases with `pnpm db:status` (add `:deep` for a real schema diff, which needs local
Supabase running).

Core tables: `customers`, `bookings`, `quotes`, `quote_line_items`, `invoices`,
`payments`, `suppliers`, `profiles`.

## The three Supabase clients

This is the single most important convention in the codebase.

| Client | Import | Context | RLS |
|---|---|---|---|
| `getSupabase()` | `lib/supabase/client.ts` | Client Components | Enforced (anon key) |
| `createSessionClient()` | `lib/supabase/server.ts` | Server Components, internal API routes | Enforced — reads the caller's cookie-based session |
| `createServiceClient()` | `lib/supabase/server.ts` | Trusted server-only contexts (public intake routes, background jobs) | **Bypassed entirely** |

Get this wrong in one direction and normal operations silently 403 under RLS. Get it
wrong in the other — reaching for `createServiceClient()` in a route that should be
user-scoped — and one consultant's request can read or write another consultant's data
with no policy check in between. `createServiceClient()` is server-only; never let it
anywhere near client code.

## Quality gates

`pnpm lint`, `pnpm typecheck`, `pnpm test:ci`, `pnpm build`. `.github/workflows/ci.yml`
runs all four on every pull request and on every push to `dev` and `main`.

## Deploy path

Feature branch → PR into `dev` → PR from `dev` into `main`. `main` is production;
`.github/workflows/db-migrations.yml` runs a `migrate-prod` job that pushes pending
migrations to production automatically on merge to `main`. A pre-push git hook blocks
direct pushes to `main`.

## Where the documents come from

Quote, invoice, voucher, itinerary and worksheet PDFs are rendered server-side with
`@react-pdf/renderer` — see `lib/quotes/pdf/`, `lib/invoices/pdf/`, `lib/voucher/pdf/`,
`lib/itinerary/pdf/`, `lib/worksheet/pdf/`. Fonts are registered from `assets/fonts/` by
`lib/pdf/document-fonts.ts`. Emails are React Email components under `emails/`.

## Gotchas worth an hour of someone's time

- Several `db:*` scripts (`db:status`, `db:remote:push:*`, `db:check-drift:*`) shell out
  to PowerShell (`scripts/*.ps1`). They run fine from PowerShell or Git Bash on Windows;
  expect friction if you try to run them from a non-Windows CI runner directly.
- There is no `middleware.ts`. Route protection lives entirely in server layouts
  (`createSessionClient()` + redirect to `/login`) — there is no single choke point to
  check when auditing access control.
- `next.config.mjs`'s `outputFileTracingIncludes` is what ships `assets/fonts/**` to the
  serverless PDF-generating routes. Add a new route that renders a PDF and forget this
  entry, and the deploy will build fine but throw a missing-font error at runtime.

See `CLAUDE.md` at the repo root for full coding conventions — not repeated here.
