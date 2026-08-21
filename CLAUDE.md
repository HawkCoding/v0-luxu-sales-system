# Luxus Sales System — AI Agent Instructions

## Project Overview

Luxus Sales System manages the full lifecycle of luxury train travel bookings:
**New Enquiry → Quote Sent → Quote Accepted → Deposit Invoice Sent → Deposit Paid → Final Invoice Sent → Paid in Full → Voucher Sent → Closed**

The supplier booking step is captured by the `deposit_paid` stage; there is no separate `booking_made` enum value. `booking_services.booking_date` / `confirmation_date` / `payment_made_date` / `paid_with` still exist for the internal booking worksheet PDF, but are no longer editable anywhere in the app. Stage transitions are enforced by `lib/pipeline/validate-transition.ts`.

Key domain rules:
- Quotes are valid 14 days and versioned (e.g. `LTT-2026-0001-Q1`) — the booking-number prefix is `LTT`, set by `JOB_NUMBER_PREFIX` in `lib/job-numbering.ts`
- Default deposit is configurable in Settings (default 25%, overridable per job at invoice generation) — a booking cannot be confirmed without `deposit_paid = TRUE`
- Voucher is only available when `invoice_balance = 0`
- Core tables: `customers`, `jobs`, `quotes`, `quote_items`, `invoices`, `payments`, `suppliers`

User roles:
- **Salesperson** — create jobs, manage customers, quotes, invoices, payments, vouchers
- **Manager/Admin** — manage suppliers, pricing, follow-ups, settings, reporting

---

## Communication Style

Default to terse, high-signal output. These rules override any verbose defaults.

- Lead with the answer or the change. No preambles ("I'll help with that", "Let me…", "Sure!").
- No trailing summary of what you just did — the diff or tool output speaks for itself. End-of-turn is one sentence max, only if something needs flagging.
- Drop filler: "Certainly", "Great question", "You're absolutely right", "I hope this helps".
- Plain questions get 1–3 sentence answers — no headers, no bullet lists unless the content is genuinely a list.
- Reference code as `file:line` (or markdown link), don't paste blocks the user can already see in their editor.
- State results directly; skip meta-commentary about what you're about to do next. Just do it.
- Don't restate the user's request back to them.
- When proposing options, give the recommendation first and the trade-off in one line — not a comparison matrix.

---

## General Stack & Conventions

- **Framework**: Next.js App Router (no Pages Router), React 19, TypeScript strict mode
- **Data**: Supabase (Postgres + Auth + Storage)
- **Styling**: Tailwind CSS v4, Shadcn UI, `lucide-react` icons
- **Fetching**: SWR for client-side data fetching (`lib/use-data.ts` patterns)
- **Validation**: Zod at all API boundaries
- **Directory structure**: No `src/`. Roots are `app/`, `components/`, `lib/`, `hooks/`
- **File naming**: kebab-case for all files
- **Exports**: named exports preferred; default exports only for Next.js page/layout files
- **Server Components by default** — add `"use client"` only when hooks, events, or browser APIs are needed

Reference files: `package.json`, `app/app/layout.tsx`, `lib/use-data.ts`

---

## Project Skills

- Shared project skills live in `skills/<skill-name>/SKILL.md`.
- Claude Code also has discovery shims under `.claude/skills/<skill-name>/SKILL.md`; keep the shared `skills/<skill-name>/SKILL.md` files as the source of truth.
- Use `skills/grill-me/SKILL.md` when the user asks to stress-test a plan or design, asks to be grilled, or says "grill me".
- When using `grill-me`, ask exactly one question at a time, provide a recommended answer with each question, and inspect the codebase instead of asking when the answer can be discovered locally.
- Use `skills/db-sync/SKILL.md` when the user asks whether local, dev, and production databases are in sync, mentions drift or schema differences, or invokes `/db-sync`.
- Use `skills/ubiquitous-language/SKILL.md` when the user wants to define domain terms, build a glossary, harden terminology, create a ubiquitous language, or mentions "domain model" or "DDD".
- When using `ubiquitous-language`, extract domain terms from the current conversation, update `UBIQUITOUS_LANGUAGE.md`, flag ambiguities, and propose canonical terms.

---

## Package Manager

**Use `pnpm` exclusively.** Never use `npm install` or `yarn`.

- Add packages: `pnpm add <package>`
- Install: `pnpm install`
- Vercel CI runs `pnpm install --frozen-lockfile` — using `npm` silently writes `package-lock.json` instead of `pnpm-lock.yaml`, which breaks CI
- If pnpm is unavailable: `npm install -g corepack@latest && corepack enable`

---

## Security

These rules always apply:

- Never commit secrets, API keys, tokens, or `.env` files
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the client
- Protect sensitive routes and operations on the server — never rely on client-side role checks alone
- Verify users with `supabase.auth.getUser()` in server code
- Check `profiles.clearance_level` for role-restricted actions
- Validate all external input at API boundaries with Zod
- Prefer `createSessionClient()` (RLS-aware, user-scoped) for all normal operations
- Use `createServiceClient()` only intentionally and only server-side
- Never leak stack traces, secrets, or infrastructure details in responses

Reference files: `lib/supabase/server.ts`, `app/app/layout.tsx`

---

## Supabase Patterns

**Client selection — this matters for RLS:**

| Context | Client | Import |
|---|---|---|
| Client Components | `getSupabase()` | `@/lib/supabase/client.ts` |
| Server Components / API routes | `createSessionClient()` | `@/lib/supabase/server.ts` |
| Intentional RLS bypass (server only) | `createServiceClient()` | `@/lib/supabase/server.ts` |

- Always use `Database` type from `@/lib/supabase/types` for typing
- Use explicit column lists in queries — avoid `select('*')` in production code
- Always check the Supabase `error` field before using `data`
- Auth in server code: `const { data: { user } } = await supabase.auth.getUser()`
- Migrations: apply locally with `pnpm db:reset`, regenerate types with `pnpm run db:types`
- Applying pending migrations to a hosted database is autonomous: when `pnpm db:status` reports a target BEHIND, push it without asking — `pnpm db:remote:push:dev` for development, `pnpm db:remote:push:prod` for production. Destructive migrations (`DELETE`, `DROP`, `TRUNCATE`, data-mutating `UPDATE`) are included; apply them and report what changed afterwards
- Production pushes need `ALLOW_PRODUCTION_DB_PUSH=I_UNDERSTAND_THIS_WRITES_TO_PRODUCTION` set in the shell first. `-ConfirmProduction` is already baked into the npm script — passing it again fails with `ParameterAlreadyBound`
- The `migrate-prod` CI job still pushes pending migrations to production on every merge to `main` (see `.github/workflows/db-migrations.yml`); a manual prod push just gets there first, and re-running is a no-op
- AHEAD or schema DRIFT is not autonomous — `pnpm db:pull` writes a migration into the repo that needs review before it is committed
- Drift checking is local before a PR, CI only after a merge: run `pnpm db:status` (both targets, migration history) or `pnpm db:status:deep` (also a real schema diff, needs local Supabase up) and don't stack more migrations on a drifted branch; `db-migrations.yml` re-checks on push to `dev`/`main` only, never on `pull_request`
- `pnpm db:status` supersedes the single-target `pnpm db:check-drift:dev` / `:prod`, which still work
- Keep migrations idempotent: use `IF NOT EXISTS` / `DROP IF EXISTS`

Reference files: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/types.ts`

---

## API Route Patterns

Applies to `app/api/**/*.ts`:

- Authenticate first: `createSessionClient()` + `supabase.auth.getUser()` — return `401` if not authenticated
- Return `403` for insufficient access (authenticated but not permitted)
- Validate request body with Zod — return `400` for invalid input
- Check `profiles.clearance_level` for role-restricted actions
- Use `NextResponse.json()` with consistent error shape: `{ error: string, details?: unknown }`
- Fail early: auth → permissions → validation → logic (in that order)
- Always check Supabase `error` before using `data`
- Use `createSessionClient()` for user-scoped operations; `createServiceClient()` only when intentionally bypassing RLS

Reference files: `app/api/customers/import/route.ts`, `lib/supabase/server.ts`

---

## Next.js & React Patterns

**Architecture:**
- App Router only — no Pages Router
- File conventions: `page.tsx`, `layout.tsx`, `route.ts`, `loading.tsx`, `error.tsx`, `not-found.tsx`
- Server layouts must use `createSessionClient()` and redirect unauthenticated users to `/login`
- Route protection belongs in server layouts, not client-side redirects
- Interactive screens call internal API routes via SWR hooks — reuse patterns from `lib/use-data.ts`
- Use `next/link` for navigation

**Components:**
- One primary component per file, kebab-case filename
- Named exports for reusable components
- Props typed via `interface ComponentNameProps`
- Keep props focused — use composition over prop drilling
- Reuse primitives from `@/components/ui`
- Data-driven components must handle loading, empty, error, and success states
- Extract repeated JSX sections into smaller components

Reference files: `app/app/layout.tsx`, `lib/use-data.ts`, `components/ui/button.tsx`

---

## TypeScript Conventions

Applies to all `.ts` and `.tsx` files:

- `strict: true` is assumed — never disable strict checks
- `const` over `let`, never `var`
- Explicit types on all exported APIs and exported function return types
- Use `interface` for object-shaped props and domain models
- Use `type` for unions, mapped types, and utility type compositions
- Use discriminated unions for variant state
- Never use `any` unless unavoidable — if used, explain why in a comment
- No `// @ts-ignore` unless explicitly requested by the user
- Use optional chaining (`?.`) and nullish coalescing (`??`)
- Narrow values before use — avoid non-null assertions (`!`)
- Import domain types from `@/lib/types` or `@/lib/supabase/types`

Reference files: `tsconfig.json`, `lib/types.ts`, `lib/supabase/types.ts`

---

## UI & Styling

Applies to all `.tsx` files:

- Use Tailwind utility classes — avoid custom CSS unless Tailwind can't do it
- Use `cn()` from `@/lib/utils.ts` for conditional class merging
- Use `cva` for component variants
- Reuse components from `@/components/ui` before building new primitives
- Mobile-first responsive design
- Semantic HTML for accessibility — buttons for actions, links for navigation
- Keyboard accessible: all interactive elements must work without a mouse
- Add `aria-*` attributes when semantic HTML alone isn't sufficient
- Never rely on color alone to convey state
- Use `lucide-react` for all icons
- Always show visible hover, focus, and disabled states

Reference files: `lib/utils.ts`, `components/ui/button.tsx`, `app/globals.css`

---

## Testing

- Framework: Vitest — run with `pnpm test`, `pnpm test:ci`, `pnpm test:coverage`
- File naming: `*.test.ts` / `*.test.tsx` — collocate tests near the code they test
- Cover both success and failure paths, including validation and permission edge cases
- Use `vi.mock()` for mocking — mock Supabase and all network boundaries
- Never test live Supabase by default
- Write small, deterministic unit tests with clear `describe`/`it` names

---

## App Versioning

- `lib/version.ts` is the app version source of truth via `APP_VERSION`
- Any agent that makes one or more code changes in a session must bump `APP_VERSION` exactly once before finishing
- The bump format is `X.XX`, incremented by `0.01` each session with code changes
- If no files were changed, do not bump the version
- Use `pnpm app:version:bump` to apply the bump
- Keep the dashboard-visible version display wired to `APP_VERSION` so the latest change is reflected in the UI

---

## PR Workflow

- **Base branch is `dev`** — feature branches always target `dev`, never `main` directly
- Use `gh pr create --base dev`
- To promote to production: open a PR from `dev` → `main`
- Commit pending changes before pushing (exclude `.env` and secret files)
- Push with `git push -u origin HEAD`
- Generate PR title and body from `git log` and `git diff`
- Do not force-push, do not change the default branch, do not merge automatically
