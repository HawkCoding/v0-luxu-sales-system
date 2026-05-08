# Luxus Sales System — Codex Instructions

## Project Overview

Luxus Sales System manages the full lifecycle of luxury train travel bookings:
**New Enquiry → Quote Sent → Quote Accepted → Deposit Invoice Sent → Deposit Paid → Booking Made → Final Invoice Sent → Paid in Full → Voucher Sent → Closed**

Key domain rules:
- Quotes are valid 14 days and versioned (e.g. `BT-2026-0001-Q1`)
- Default deposit is configurable in Settings (default 25%, overridable per job at invoice generation) — a booking cannot be confirmed without `deposit_paid = TRUE`
- Voucher is only available when `invoice_balance = 0`
- Core tables: `customers`, `jobs`, `quotes`, `quote_items`, `invoices`, `payments`, `suppliers`

User roles:
- **Salesperson** — create jobs, manage customers, quotes, invoices, payments, vouchers
- **Manager/Admin** — manage suppliers, pricing, follow-ups, settings, reporting

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

## Package Manager

**Use `pnpm` exclusively.** Never use `npm install` or `yarn`.

- Add packages: `pnpm add <package>`
- Install: `pnpm install`
- Vercel CI runs `pnpm install --frozen-lockfile` — using `npm` silently writes `package-lock.json` instead of `pnpm-lock.yaml`, which breaks CI
- If pnpm is unavailable: `npm install -g corepack@latest && corepack enable`

---

## Autonomy & Approval Policy

Codex should work autonomously for routine engineering tasks and avoid stopping for permission when the action is low risk, reversible, and clearly aligned with the user's request.

Default behavior:
- Make reasonable implementation decisions from the existing codebase patterns instead of asking for every detail
- Read, search, inspect, edit, format, and run local checks autonomously when needed to complete the task
- Create or update local files that are directly related to the request
- Add focused tests, update documentation, and make small refactors when they reduce risk or are necessary for the requested change
- Run non-destructive local commands such as `pnpm test`, `pnpm test:ci`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm app:version:bump`, `git status`, `git diff`, and read-only `gh` commands
- Use general public safety, security, privacy, and engineering judgment to proceed when the safe path is obvious

Ask the user first when an action is destructive, hard to reverse, externally visible, security-sensitive, expensive, or likely to affect production data or other people.

Always ask before:
- Deleting large amounts of code, data, migrations, branches, files, or user-created work
- Running destructive commands such as `rm -rf`, `git reset --hard`, force-pushes, database resets, truncates, or irreversible migrations
- Applying migrations to a remote or hosted Supabase project
- Changing authentication, RLS policies, permissions, secrets, billing, deployment settings, or production infrastructure
- Installing new packages when the need is not obvious from the request
- Sending emails, contacting customers or suppliers, triggering payments, creating invoices, or making externally visible business changes
- Committing, pushing, opening PRs, merging, deploying, or changing release/version control state unless the user asked for that workflow
- Using secrets, credentials, or service-role access beyond the minimum required server-side use

Clarifying questions:
- Ask only when the missing information would materially change the outcome or create meaningful risk
- Prefer one concise question over a long questionnaire
- When useful, ask the user for standing preferences about what Codex may do automatically and what requires approval
- If the user has already given a clear preference, follow it consistently unless it conflicts with security, safety, or repository rules

If an autonomous action fails, Codex should inspect the error, try a safe local fix, and continue. If the next step requires elevated permissions, network access, destructive changes, or production access, ask first and explain why.

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
- Never apply migrations to remote/hosted Supabase unless explicitly asked
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

## Verification Expectations

- Before finishing a code change, run the narrowest relevant checks you can: tests, typecheck, lint, or build validation depending on the scope
- If you cannot run verification, say exactly what was not run and why
- Prefer small, focused diffs that preserve existing architecture and naming patterns
- Do not make schema, auth, or RLS changes without checking downstream effects on quotes, invoices, payments, and voucher flows

---

## PR Workflow

- **Base branch is `main`**
- Use `gh pr create --base main`
- Commit pending changes before pushing (exclude `.env` and secret files)
- Push with `git push -u origin HEAD`
- Generate PR title and body from `git log` and `git diff`
- Do not force-push, do not change the default branch, do not merge automatically
