# Security Review — Luxus Sales System

| Field | Value |
|---|---|
| Repository | `hawkcoding/v0-luxu-sales-system` |
| Run date | 2026-05-23 |
| Branch reviewed | `claude/friendly-curie-tlf6g` |
| Overall security posture | **Moderate** |
| Highest-risk issue | Permissive RLS policies (`USING (true)`) on all business tables |
| Lowest-risk issue | Stray `linked-remote-types.tmp.ts` build artifact committed to repo |
| Total findings | 15 |

---

## 1. Summary

- **Total vulnerabilities:** 15
- **Highest-risk issue:** Permissive Supabase RLS policies — every authenticated user can read/write every row in business tables (`bookings`, `customers`, `quotes`, `invoices`, `payments`, etc.). Defense currently depends entirely on the API layer.
- **Lowest-risk issue:** `linked-remote-types.tmp.ts` — an 86 KB stray temp file committed to the repo. No secret content; pure hygiene issue.
- **Overall security posture:** **Moderate** — auth helpers, Zod validation, secret hygiene, and cookie handling are sound. The big drags are the toothless RLS posture and 31 known transitive-dependency CVEs.

---

## 2. Risk Matrix

| # | Issue | Likelihood | Impact | Risk Level |
|---|---|---|---|---|
| 1 | Permissive RLS policies (`USING (true)`) on business tables | High | High | **Critical** |
| 2 | 31 transitive dependency CVEs (lodash, vite, picomatch) | Medium | High | **High** |
| 3 | XSS via unsanitised `dangerouslySetInnerHTML` in template preview | Medium | High | **High** |
| 4 | Missing HTTP security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options) | High | Medium | **High** |
| 5 | 43 API route files where automatic grep could not confirm an auth check | Medium | High | **High** |
| 6 | Weak password minimum (6 chars) on user creation | Medium | Medium | **Medium** |
| 7 | Cron auth relies solely on `CRON_SECRET` env var — no `X-Vercel-Cron` fallback | Low | High | **Medium** |
| 8 | `console.error` in users route logs Postgres `hint`/`details` | Medium | Low | **Medium** |
| 9 | Demo mode silently engaged when `RESEND_API_KEY` is unset in production | Medium | Medium | **Medium** |
| 10 | `images.unoptimized: true` in `next.config.mjs` (loses CSP/sanitisation benefits) | Low | Low | **Low** |
| 11 | `linked-remote-types.tmp.ts` stray build artifact in git | High | Low | **Low** |
| 12 | No explicit RLS policy listed for `profiles` table (relies on default deny) | Low | Medium | **Low** |
| 13 | `eslint` 8.57.1 is end-of-life (security advisories no longer issued) | Low | Low | **Low** |
| 14 | `.eslintignore` deprecated format; lint script bypasses project config (`--no-eslintrc`) | Medium | Low | **Low** |
| 15 | No rate-limiting on auth-adjacent or write endpoints | Medium | Low | **Low** |

---

## 3. Detailed Findings

### Finding 1 — Permissive RLS policies on business tables
- **Description:** RLS is enabled on all 25 application tables, but the policies are written as `CREATE POLICY "biz_select" ... USING (true)`. Any authenticated session can SELECT/INSERT/UPDATE any row in `bookings`, `customers`, `quotes`, `quote_items`, `invoices`, `payments`, `suppliers`, etc. The only access control is whatever the API layer chooses to enforce.
- **Affected area:** `supabase/migrations/20260308095136_remote_schema.sql`
- **Likelihood / Impact / Risk:** High / High / **Critical**
- **Effort estimate:** High
- **Cost implication:** High
- **Scope of fix:** Cross-cutting (every table policy + every code path that assumes RLS isn't in the way)
- **Recommended fix:** Either (a) write proper RLS policies keyed on `auth.uid()` joined to `profiles.clearance_level` so the database enforces tenancy and role rules, or (b) explicitly document that RLS is a defense-in-depth no-op and lock down `createSessionClient()` so it cannot be used to bypass API checks. If (a), introduce the policies incrementally per table with tests using a non-service-role client.

### Finding 2 — Transitive dependency CVEs
- **Description:** 31 advisories surface in the dep tree. Most severe:
  - `lodash <=4.17.23` via `recharts` — `_.template` code injection.
  - `vite 7.0.0–7.3.1` via dev tooling — `server.fs.deny` bypass + WebSocket arbitrary file read.
  - `picomatch <4.0.4` via `vite-tsconfig-paths` — ReDoS via extglob.
  - Direct deps (`next 16.1.6`, `react 19.2.4`, `@supabase/supabase-js 2.98.0`, `zod 3.24.1`, `typescript 5.7.3`) are current.
- **Affected area:** `package.json`, `pnpm-lock.yaml`
- **Likelihood / Impact / Risk:** Medium / High / **High** (lower in production: vite-family issues are dev-only)
- **Effort estimate:** Medium
- **Cost implication:** Low–Medium
- **Scope of fix:** Localised to lockfile
- **Recommended fix:** `pnpm update recharts vite vite-tsconfig-paths vitest` then re-run `pnpm audit`. Pin overrides in `package.json#pnpm.overrides` for any transitive that hasn't published a patched parent release.

### Finding 3 — XSS via unsanitised template preview
- **Description:** `app/app/templates/page.tsx:185` renders `dangerouslySetInnerHTML={{ __html: preview?.bodyHtml || "" }}`. Template HTML is stored in the database and edited by users with `can("edit:templates")`. A malicious template author can inject `<script>` or event handlers that fire in another operator's session — and the same body is later piped through Resend to customers.
- **Affected area:** `app/app/templates/page.tsx`, template render path, outbound email path
- **Likelihood / Impact / Risk:** Medium / High / **High**
- **Effort estimate:** Medium
- **Cost implication:** Low
- **Scope of fix:** Localised (template renderer) with sanitisation library added
- **Recommended fix:** Sanitise on render with `DOMPurify` (server-side or `isomorphic-dompurify`); allow only the tag/attribute set the email templates actually need (`p, br, a, strong, em, ul, ol, li, img[src|alt]`). Also sanitise on write so stored content is already safe.

### Finding 4 — Missing HTTP security headers
- **Description:** `vercel.json` has no `headers` block. Responses ship without `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, or `Referrer-Policy`. Combined with the XSS finding above, the app is clickjackable and lacks browser-side mitigations.
- **Affected area:** `vercel.json`, `next.config.mjs`
- **Likelihood / Impact / Risk:** High / Medium / **High**
- **Effort estimate:** Low
- **Cost implication:** Low
- **Scope of fix:** Localised
- **Recommended fix:** Add a `headers` array to `vercel.json` (or use `next.config.mjs` `headers()`):
  ```json
  "headers": [{
    "source": "/(.*)",
    "headers": [
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "X-Frame-Options", "value": "DENY" },
      { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
      { "key": "Strict-Transport-Security", "value": "max-age=31536000; includeSubDomains; preload" },
      { "key": "Content-Security-Policy", "value": "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'" }
    ]
  }]
  ```
  Tighten the CSP iteratively until inline scripts/styles are nonce-based.

### Finding 5 — API routes where auth could not be confirmed by grep
- **Description:** 43 files under `app/api/**/route.ts` did not surface `getUser()` / `requireRole()` in a flat grep. Most likely route through the `requireAuthenticatedUser()` helper in `lib/api/auth.ts`, but at least the following should be audited individually: `backups/route.ts`, `packages/route.ts`, `suppliers/route.ts`, `correspondence/route.ts`, `templates/route.ts`, `payments/route.ts`, `quotes/route.ts`, `pipeline/route.ts`.
- **Affected area:** `app/api/**/route.ts`, `lib/api/auth.ts`
- **Likelihood / Impact / Risk:** Medium / High / **High** (conditional on whether the helper is consistently used)
- **Effort estimate:** Low (audit) / Medium (if gaps found)
- **Cost implication:** Low
- **Scope of fix:** Cross-cutting verification
- **Recommended fix:** Add a Vitest unit test that statically imports every `route.ts` and asserts each export references the auth helper. Alternatively, wrap handlers in a `withAuth(handler, { role })` factory so the auth check is impossible to omit.

### Finding 6 — Weak password minimum on user creation
- **Description:** `app/api/users/route.ts:20` enforces only `z.string().min(6)`. A 6-character password is below modern guidance (NIST 800-63B recommends ≥8, OWASP recommends ≥12 for staff systems). This endpoint is admin-facing so the blast radius is smaller, but new staff accounts can be created with trivially crackable passwords.
- **Affected area:** `app/api/users/route.ts`
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**
- **Effort estimate:** Low
- **Cost implication:** Low
- **Scope of fix:** Localised
- **Recommended fix:** Raise to `.min(12)`; reject common passwords (k-anonymity check via HIBP API or a static deny list). Mirror the same Zod schema on the password-change route.

### Finding 7 — Cron auth depends solely on `CRON_SECRET`
- **Description:** `app/api/cron/email-sync/route.ts`, `payment-reminders/route.ts`, and `pipeline-auto-close/route.ts` all return 401 if `process.env.CRON_SECRET` is missing or the bearer doesn't match. Correctly fails closed, but if the env var ever drifts between Vercel project and code deploy, crons silently 401 — and there's no second-factor (Vercel signs cron requests with `x-vercel-signature` / sets `x-vercel-cron: 1`).
- **Affected area:** `app/api/cron/**/route.ts`
- **Likelihood / Impact / Risk:** Low / High / **Medium**
- **Effort estimate:** Low
- **Cost implication:** Low
- **Scope of fix:** Localised
- **Recommended fix:** Allow either a valid `CRON_SECRET` bearer **or** the presence of the `x-vercel-cron` header when `process.env.VERCEL === '1'`. Add an alert if no cron has run in 24 h.

### Finding 8 — Sensitive logging in user create
- **Description:** `app/api/users/route.ts:154-160` does `console.error("Failed to create user profile", { userId, email, message, code, details, hint })`. Supabase `hint` and `details` can include column names and constraint internals; in a hosted log aggregator this becomes a low-grade information disclosure tied to a user's email.
- **Affected area:** `app/api/users/route.ts:154-160`
- **Likelihood / Impact / Risk:** Medium / Low / **Medium**
- **Effort estimate:** Low
- **Cost implication:** Low
- **Scope of fix:** Localised
- **Recommended fix:** Drop `details` and `hint` from the production log line, or redact email to `mask(email)`. Funnel through a single `logError()` helper that does the redaction.

### Finding 9 — Demo mode auto-enabled when email is unconfigured
- **Description:** `app/app/layout.tsx:57` sets `demoMode = !process.env.RESEND_API_KEY || process.env.DEMO_MODE === "1"`. If a production deploy is missing `RESEND_API_KEY`, the app silently switches into demo behaviour — which may relax checks, expose seeded data, or fail to send transactional mail without alerting operators.
- **Affected area:** `app/app/layout.tsx`
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**
- **Effort estimate:** Low
- **Cost implication:** Low
- **Scope of fix:** Localised
- **Recommended fix:** Make demo mode opt-in only: `demoMode = process.env.DEMO_MODE === "1"`. If `RESEND_API_KEY` is missing in production, throw at boot.

### Finding 10 — `images.unoptimized: true`
- **Description:** `next.config.mjs` disables the image optimizer globally. Loses the SSRF protections built into `next/image` remote loaders and the automatic content-type validation.
- **Affected area:** `next.config.mjs`
- **Likelihood / Impact / Risk:** Low / Low / **Low**
- **Effort estimate:** Low
- **Cost implication:** Low
- **Scope of fix:** Localised
- **Recommended fix:** Remove the flag and configure `images.remotePatterns` with an allow-list of Supabase storage hosts.

### Finding 11 — Stray build artifact in git
- **Description:** `linked-remote-types.tmp.ts` (86 KB) is committed. No secret content, but it pollutes diffs and bloats clones.
- **Affected area:** repo root
- **Likelihood / Impact / Risk:** High / Low / **Low**
- **Effort estimate:** Low
- **Cost implication:** Low
- **Scope of fix:** Localised
- **Recommended fix:** `git rm linked-remote-types.tmp.ts`; add `*.tmp.ts` to `.gitignore`.

### Finding 12 — `profiles` table has RLS enabled but no explicit policy
- **Description:** The migration enables RLS on `profiles` but no `CREATE POLICY` for it appears in the dump. With RLS on and no policies, the table is effectively unreadable except through service-role. This is fail-safe but means the application must always use `createServiceClient()` to read profiles — which it does in `lib/api/auth.ts` — but any new code path that uses `createSessionClient()` against `profiles` will silently return zero rows.
- **Affected area:** `supabase/migrations/20260308095136_remote_schema.sql`, `lib/api/auth.ts`
- **Likelihood / Impact / Risk:** Low / Medium / **Low**
- **Effort estimate:** Low
- **Cost implication:** Low
- **Scope of fix:** Localised
- **Recommended fix:** Add an explicit `CREATE POLICY profiles_self_read ON profiles FOR SELECT USING (auth.uid() = user_id);` so session-scoped reads of "my own profile" work without service-role.

### Finding 13 — End-of-life `eslint` 8.57.1
- **Description:** ESLint 8.x reached EOL in October 2024. No further security patches.
- **Affected area:** `package.json` devDependencies
- **Likelihood / Impact / Risk:** Low / Low / **Low**
- **Effort estimate:** Medium
- **Cost implication:** Low
- **Scope of fix:** Localised (flat-config migration required)
- **Recommended fix:** Upgrade to ESLint 9.x + flat config (`eslint.config.mjs`).

### Finding 14 — Lint script bypasses project ESLint config
- **Description:** `package.json` lint script is `eslint . --ext .js,.mjs,.cjs --no-error-on-unmatched-pattern --no-eslintrc ...`. It does not lint `.ts`/`.tsx` and runs with `--no-eslintrc`, so any project rules (including security plugins) are skipped. Lint is providing false assurance.
- **Affected area:** `package.json` scripts
- **Likelihood / Impact / Risk:** Medium / Low / **Low**
- **Effort estimate:** Medium
- **Cost implication:** Low
- **Scope of fix:** Localised
- **Recommended fix:** Add `.ts,.tsx`, drop `--no-eslintrc`, add `eslint-plugin-security` and `@typescript-eslint/eslint-plugin`.

### Finding 15 — No rate limiting on auth-adjacent or write endpoints
- **Description:** `proxy.ts` only refreshes Supabase sessions; there is no per-IP / per-user rate limit on `/api/users`, `/api/customers`, login, or any write endpoint. Supabase Auth has its own throttling for sign-in, but the app's own admin routes (e.g. password-set, user create) are unprotected.
- **Affected area:** `proxy.ts`, all `app/api/**/route.ts`
- **Likelihood / Impact / Risk:** Medium / Low / **Low**
- **Effort estimate:** Medium
- **Cost implication:** Low–Medium
- **Scope of fix:** Cross-cutting
- **Recommended fix:** Use Vercel's built-in rate-limit middleware (`@vercel/firewall`) or Upstash Ratelimit in `proxy.ts` for write methods.

---

## 4. Priority Actions

Ranked by **risk reduction per unit of effort**:

1. **Add HTTP security headers** (Finding 4) — Low effort, eliminates clickjacking + boosts XSS defence. Ship today.
2. **Sanitise template HTML** (Finding 3) — Medium effort, removes a live stored-XSS path through `dangerouslySetInnerHTML`.
3. **Patch dependency CVEs** (Finding 2) — `pnpm update` plus a couple of overrides closes 31 advisories.
4. **Audit the 43 ambiguous API routes for auth** (Finding 5) — Low effort, high confidence-builder; convert to a `withAuth()` wrapper afterwards to make regressions impossible.
5. **Lock demo mode and tighten password rules** (Findings 9 + 6) — Low effort, removes a silent prod-misconfig path and brings password policy to OWASP baseline.
6. **Plan the RLS hardening** (Finding 1) — Highest impact but highest effort. Don't ship the policies blind; stage per-table with integration tests using a non-service-role client.
7. **Hygiene sweep** (Findings 8, 10, 11, 12, 13, 14, 15) — Bundle into one cleanup PR.

---

*Generated as part of the automated security review workflow. Re-run on each push to surface regressions.*
