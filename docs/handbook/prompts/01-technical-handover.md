# Step 1 — Technical Handover Sheet

> Read `docs/handbook/_preamble.md` first, then do only this step.

**Model:** Opus 5 · **Effort:** medium
**Output:** `docs/handbook/content/technical-handover.md`
**Length:** 3–4 printed pages. This is a quick-start sheet, not a manual.
**Screenshots:** none.

## Audience

A competent developer who has never seen this system and has just been handed the repo.
They get credentials and URLs separately, through a channel that is not this document.

## Scope

One question only: *what do I need to know in the first hour?*

## Source of truth — read these

- `package.json` — versions, every script
- `next.config.mjs`, `vercel.json`, `.github/workflows/*.yml`
- `DEVELOPMENT_ENVIRONMENT.md` — local setup, already accurate; compress, do not copy
- `supabase/config.toml`, `supabase/migrations/` (count them)
- `lib/supabase/server.ts`, `lib/supabase/client.ts` — the three-client rule
- `CLAUDE.md` — domain rules section only, for the pipeline summary

## Must cover

1. **What the system is** — three sentences. Luxury rail travel bookings, enquiry to voucher.
2. **Stack** — Next.js App Router, React, TypeScript strict, Tailwind v4, Shadcn UI,
   Supabase (Postgres + Auth + Storage), SWR, Zod, Vitest, Playwright. Give versions.
   Node and pnpm versions, and that pnpm is enforced by a `preinstall` guard.
3. **Repo layout** — `app/`, `components/`, `lib/`, `hooks/`, `supabase/`, `tests/`, `qa/`,
   `scripts/`. No `src/`. Kebab-case files, named exports, Server Components by default.
4. **Third-party services, by name only** — Supabase, Resend, per-salesperson cPanel SMTP,
   IMAP inbound mailboxes, Gravity Forms webhook, Vercel (hosting + cron), GitHub Actions.
   For each: one line on what it does and which env var *names* configure it.
   **No values, no URLs, no keys.**
5. **Running it locally** — Docker, `pnpm install`, `pnpm db:start`, `pnpm db:reset`,
   `pnpm dev`. Note that `.env.local` is required and supplied separately.
6. **Database** — Supabase migrations under `supabase/migrations/` (state the count),
   `pnpm db:reset` locally, `pnpm db:types` to regenerate `lib/supabase/types.ts`,
   `pnpm db:status` for drift. Name the core tables only: `customers`, `bookings`,
   `quotes`, `quote_line_items`, `invoices`, `payments`, `suppliers`, `profiles`.
7. **The three Supabase clients** and when each is correct — this is the single most
   important convention in the codebase. Include the RLS consequence of getting it wrong.
8. **Quality gates** — `pnpm lint`, `pnpm typecheck`, `pnpm test:ci`, `pnpm build`. State
   that CI runs all four on every PR.
9. **Deploy path** — feature branch → PR to `dev` → PR `dev` → `main`. Migrations are
   pushed to production by the `migrate-prod` job on merge to `main`.
10. **Where the documents come from** — PDFs are rendered server-side with
    `@react-pdf/renderer` (`lib/quotes/pdf/`, `lib/invoices/pdf/`, `lib/voucher/pdf/`,
    `lib/itinerary/pdf/`, `lib/worksheet/pdf/`), fonts are registered from `assets/fonts/`
    by `lib/pdf/document-fonts.ts`, and emails are React Email components in `emails/`.
11. **Gotchas worth an hour of someone's time** — PowerShell-backed `db:*` scripts (Windows
    coupling), `app/api/quotes/[id]/route.ts` is UTF-16 on disk, no `middleware.ts` so route
    protection lives in server layouts, and `outputFileTracingIncludes` in `next.config.mjs`
    is what ships the fonts to the PDF routes.

## Explicitly out of scope

Architecture rationale, feature history, roadmap, coding-standard lectures. The four agent
brief files already cover conventions; point at `CLAUDE.md` in one line and move on.

## Done when

- `pnpm docs:build --only technical-handover` produces a 3–4 page PDF.
- Grepping your file for `http`, `://`, `KEY=`, `password` and `@luxustravel.co.za` returns
  nothing except deliberate service names.
