# Security Review — Luxus Sales System

| Field | Value |
| --- | --- |
| Repository | `hawkcoding/v0-luxu-sales-system` |
| Branch reviewed | `claude/friendly-curie-ycbr0f` |
| Run date | 2026-06-12 |
| Overall security posture | **Poor** |
| Highest-risk issue | Vulnerable `next@16.1.6` (14 advisories, multiple High — middleware/proxy bypass, SSRF, request smuggling, CSRF) |
| Lowest-risk issue | Committed `linked-remote-types.tmp.ts` schema dump (internal model disclosure only) |
| Total findings | 18 |

---

## 1. Summary

- **18 vulnerabilities identified** across application logic, dependencies, configuration and data-handling.
- **Highest-risk issue:** `next@16.1.6` has 14 outstanding CVEs disclosed since release; several are High severity (middleware/proxy bypass, server-side request forgery via WebSocket upgrades, request smuggling, CSRF). All sensitive auth and role checks in this codebase rely on the App Router behaving correctly, so a framework bypass undermines every other control.
- **Lowest-risk issue:** the 1,454-line `linked-remote-types.tmp.ts` file checked into the repo root — leaks internal database schema only (no secrets), and the schema is largely already implied by the migrations folder.
- **Overall posture: Poor.** A working public endpoint (`/api/enquiries` POST) uses the service-role key with no authentication, no Zod validation, no rate limit, and accepts an arbitrary `linkedCustomerId` — combined with an apparently mis-wired session-refresh middleware (`proxy.ts` is not picked up by Next.js without a `middleware.ts` shim), missing HTTP security headers, a public Supabase bucket that accepts SVG uploads, a weak 6-character password floor, and a heavy stack of unpatched dependencies, the application has multiple independent paths to data exposure or takeover today.

---

## 2. Risk Matrix

| # | Issue | Likelihood | Impact | Risk Level |
| --- | --- | --- | --- | --- |
| 1 | Vulnerable `next@16.1.6` (14 CVEs incl. proxy bypass, SSRF, request smuggling, CSRF) | High | High | **Critical** |
| 2 | `vitest@4.0.18` critical CVE — arbitrary file read/execute via Vitest UI | Medium | High | **High** |
| 3 | Public `POST /api/enquiries` uses service-role key, no auth, no rate limit, accepts `linkedCustomerId` (IDOR) | High | High | **High** |
| 4 | SVG uploads to *public* `voucher-assets` Supabase bucket → stored XSS | Medium | High | **High** |
| 5 | `proxy.ts` exports `proxy`, not `middleware` — auth refresh + `/login` redirect probably not wired up | High | Medium | **High** |
| 6 | `lodash` (`<=4.17.23`) — code injection via `_.template` (transitive) | Low | High | **Medium-High** |
| 7 | `vite` (`<=7.3.1`) — `server.fs.deny` bypass and arbitrary file read via dev-server WebSocket | Medium | Medium | **Medium-High** |
| 8 | No HTTP security headers in `next.config.mjs` (CSP, HSTS, X-Frame-Options, etc.) | High | Medium | **Medium-High** |
| 9 | Weak password policy: `min(6)` chars, no complexity, `password_requirements = ""` | High | Medium | **Medium-High** |
| 10 | `dangerouslySetInnerHTML` on template preview without sanitisation | Medium | Medium | **Medium** |
| 11 | CRON auth uses non-constant-time string equality on `CRON_SECRET` | Low | Medium | **Medium** |
| 12 | Dev quick-login leaks real staff emails into client bundle (`canUseDevQuickLogin` is build-time only) | Medium | Low | **Medium** |
| 13 | Hosted Supabase project refs (dev & prod) committed in `.env.sync.local.example` | High | Low | **Medium** |
| 14 | `images.unoptimized = true` disables Next.js image safety net | Medium | Low | **Low-Medium** |
| 15 | `ws@<8.20.1`, `uuid@<11.1.1`, `brace-expansion`, `picomatch`, `postcss` transitive vulns | Medium | Low | **Low-Medium** |
| 16 | Customer search builds raw PostgREST `.or()` from user input (incomplete escape) | Low | Medium | **Low-Medium** |
| 17 | `/api/dev/replay-inbound-email` gated only on `NODE_ENV !== "production"` | Low | Medium | **Low** |
| 18 | Committed `linked-remote-types.tmp.ts` schema dump in repo root | High | Very Low | **Low** |

---

## 3. Detailed Findings

### 1. Vulnerable `next@16.1.6` — 14 outstanding CVEs

- **Description:** `pnpm audit` reports 14 advisories against the installed Next.js version. Notable High-severity issues include Middleware/Proxy bypass via segment-prefetch (CVE / GHSA-…), dynamic route parameter injection bypass, SSRF via WebSocket upgrades, HTTP request smuggling in rewrites (CVE-2026-29057), DoS in Server Components and Image Optimization API, and `null` origin CSRF bypass on Server Actions.
- **Affected area:** `package.json` (`next`: `16.1.6`) — touches every request handled by the app.
- **Likelihood / Impact / Risk:** High / High / **Critical**
- **Effort estimate:** Low — single dependency bump.
- **Cost implication:** Low (one minor-version bump within the 16.x line).
- **Scope of fix:** Localised (`package.json` + `pnpm-lock.yaml`), but requires a full regression of the App Router behaviour.
- **Recommended fix:** Upgrade to `next@>=16.2.6` (covers all listed advisories). Run `pnpm up next@^16.2.6`, re-run `pnpm test:ci` and the Playwright QA suite, redeploy.

### 2. `vitest@4.0.18` — critical CVE (arbitrary file read/execute)

- **Description:** GHSA advisory: when the Vitest UI server is listening, an attacker on the same network (or via DNS rebinding from a malicious page) can read and execute arbitrary files. Severity **Critical** in the advisory database.
- **Affected area:** `devDependencies.vitest@^4.0.18`; matters anywhere `vitest --ui` is started locally or in CI dev containers.
- **Likelihood / Impact / Risk:** Medium / High / **High**
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** `pnpm up -D vitest@^4.1.0 @vitest/coverage-v8@^4.1.0` and forbid `vitest --ui` outside of localhost in dev docs.

### 3. Public `POST /api/enquiries` — service-role insert with no auth, no rate-limit, accepts `linkedCustomerId`

- **Description:** `app/api/enquiries/route.ts` POST handler uses `createServiceClient()` (RLS bypass), does **not** call `auth.getUser()` to require authentication, has **no Zod validation** of the body, and reads `body.linkedCustomerId` to attach the new enquiry to any customer the caller names. There is also no rate limiting. An anonymous attacker can:
  - mass-insert customers, bookings, suites, travellers, transport requests, audit logs;
  - bind an enquiry/booking to any victim customer UUID (IDOR / data tampering);
  - poison `extracted_json` and `additional_services_details` with payloads that downstream UIs may render (see also finding #10).
- **Affected area:** `app/api/enquiries/route.ts:410-704`, `app/api/enquiries/route.ts:415-418` (service client), `app/api/enquiries/route.ts:441-443` (`linkedCustomerId`).
- **Likelihood / Impact / Risk:** High / High / **High**
- **Effort estimate:** Medium — needs schema, captcha/rate-limit, and a re-think of `existingCustomerId`.
- **Cost implication:** Medium.
- **Scope of fix:** Localised to the route, but touches the public enquiry form contract.
- **Recommended fix:**
  1. Wrap the body in a strict Zod schema (mirroring `customers/import/schemas.ts`).
  2. Remove `linkedCustomerId` from the public path; only honour it when the call is authenticated (`createSessionClient()`).
  3. Add CAPTCHA (hCaptcha/Turnstile per `supabase/config.toml`) and IP/email rate-limiting via an upstream (Vercel Firewall, Upstash, or a Postgres window function).
  4. Prefer `createSessionClient()` and a narrowly-scoped Postgres function over `createServiceClient()` for the unauthenticated path.

### 4. SVG uploads to public `voucher-assets` bucket → stored XSS

- **Description:** `supabase/config.toml` sets `[storage.buckets.voucher-assets] public = true` and lists `image/svg+xml` in `allowed_mime_types`. `app/api/voucher-template/upload/route.ts` accepts SVG files and stores them at `{kind}.svg`, then writes the resulting `publicUrl` into `voucher_template.logo_url` / `banner_url`. SVGs can embed `<script>`, foreign-object HTML, and CSS that fires JS — when rendered inline (or even when the URL is visited directly) the browser executes them with the origin of the Supabase storage host. If a Voucher template image is ever rendered as `<img>` only, the risk is limited, but the public URL is reachable and indexable.
- **Affected area:** `supabase/config.toml:121-125`, `app/api/voucher-template/upload/route.ts:8-78`.
- **Likelihood / Impact / Risk:** Medium / High / **High**
- **Effort estimate:** Low–Medium.
- **Cost implication:** Low.
- **Scope of fix:** Cross-cutting (config + upload route + any place SVGs are rendered inline).
- **Recommended fix:** Drop `image/svg+xml` from `allowed_mime_types` (allow PNG/WebP/JPEG only), or sanitise SVG server-side with DOMPurify’s SVG profile and re-serialise before upload. Additionally serve the bucket with `Content-Disposition: attachment` for any SVG, and never use `dangerouslySetInnerHTML` to embed bucket content.

### 5. `proxy.ts` is not wired up as Next.js middleware

- **Description:** Next.js auto-discovers `middleware.ts` (or `middleware.js`) in the project root. The repo has `proxy.ts` exporting a function named `proxy` plus a `config.matcher`. No `middleware.ts` exists (`Glob middleware.*` returned nothing) and `Grep "export.*middleware"` returned no matches. This means the Supabase session-refresh, the stale-refresh-token cookie cleanup, and the `/login → /app` redirect for already-authenticated users probably do not run. Net effect: stale Supabase auth cookies are not pruned (users see broken sessions), `/login` is reachable while logged in, and any future security logic added to the middleware is silently inert.
- **Affected area:** `proxy.ts:29-84`.
- **Likelihood / Impact / Risk:** High (the file exists but Next.js won’t load it) / Medium / **High**
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Either rename `proxy.ts` → `middleware.ts` and export the function as `middleware`, or create a `middleware.ts` that re-exports: `export { proxy as middleware, config } from "./proxy"`.

### 6. `lodash <= 4.17.23` — code injection via `_.template`

- **Description:** Transitive advisory (GHSA on lodash) — `_.template` honours user-controlled key names and is exploitable for arbitrary code execution. Although the app does not call `_.template` directly, the dep tree pulls a vulnerable version.
- **Affected area:** `pnpm-lock.yaml` (transitive).
- **Likelihood / Impact / Risk:** Low / High / **Medium-High**
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Add a `pnpm.overrides` for `lodash@^4.18.0` (or whatever the patched line is), or upgrade the parent dependency that pins it.

### 7. `vite <= 7.3.1` — multiple High-severity dev-server CVEs

- **Description:** Three advisories: path traversal in optimized-deps `.map` handling, `server.fs.deny` bypassed with queries, and arbitrary file read via the Vite dev-server WebSocket. Triggered when developers run Vite-backed tooling on a routable interface or when a teammate visits a malicious page while a dev server is up.
- **Affected area:** Transitive via Vitest / `vite-tsconfig-paths`.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium-High**
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Bump Vitest (finding #2) and verify `vite >= 7.3.2`; pin via `pnpm.overrides` if necessary.

### 8. No HTTP security headers in `next.config.mjs`

- **Description:** `next.config.mjs` defines only `images.unoptimized: true` and no `headers()` function. Responses lack Content-Security-Policy, HSTS, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, `X-Content-Type-Options`, and `Permissions-Policy`. The app is therefore clickjackable, susceptible to MIME-sniff XSS on user-uploaded content, and has no first-line defence against the dangerouslySetInnerHTML issue in finding #10.
- **Affected area:** `next.config.mjs`.
- **Likelihood / Impact / Risk:** High / Medium / **Medium-High**
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised but exercise care with CSP given Next’s inline scripts and Supabase domains.
- **Recommended fix:** Add a Next `headers()` config that emits `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `X-Frame-Options: DENY`, and a Report-Only CSP that allowlists `self`, the Supabase URL, and Resend (then promote to enforced).

### 9. Weak password policy

- **Description:** `supabase/config.toml:189-193` sets `minimum_password_length = 6` with empty `password_requirements`. `app/api/users/route.ts:20` and `app/api/users/[userId]/password/route.ts:59` enforce `min(6)`. A 6-character all-lower password (`secret`) is acceptable for staff accounts including admins, including the password an admin sets on behalf of another user.
- **Affected area:** `supabase/config.toml`, `app/api/users/route.ts`, `app/api/users/[userId]/password/route.ts`.
- **Likelihood / Impact / Risk:** High / Medium / **Medium-High**
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Cross-cutting (Supabase config + API + onboarding emails).
- **Recommended fix:** Raise to `min(12)`, set `password_requirements = "lower_upper_letters_digits"` (or stronger), and validate identically in the two API routes. Strongly consider enabling MFA TOTP for admins (`[auth.mfa.totp]` is currently disabled).

### 10. `dangerouslySetInnerHTML` on email-template preview

- **Description:** `app/app/templates/page.tsx:185` renders `preview?.bodyHtml` directly. Templates are admin/manager editable, but the preview is reached by other admins/managers; a malicious or compromised template author can XSS another admin and pivot to user creation, password reset, or backup restore.
- **Affected area:** `app/app/templates/page.tsx:185`.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Render the preview inside a sandboxed `<iframe srcDoc=… sandbox="allow-same-origin">`, or sanitise with DOMPurify before assignment. Combined with finding #8 (CSP) this becomes defence-in-depth.

### 11. CRON auth uses non-constant-time equality

- **Description:** All `app/api/cron/*/route.ts` files do `authHeader !== \`Bearer ${process.env.CRON_SECRET}\``. `!==` short-circuits on first mismatched byte, leaking the secret length and prefix over enough requests. Only meaningful if Vercel Cron tokens are long-lived and an attacker can sample timing, but easy to fix.
- **Affected area:** `app/api/cron/email-sync/route.ts:7`, `app/api/cron/backup/route.ts:10`, `app/api/cron/pipeline-auto-close/route.ts:42`, plus the other two cron routes.
- **Likelihood / Impact / Risk:** Low / Medium / **Medium**
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Cross-cutting (five files) — extract a helper.
- **Recommended fix:** Add `lib/api/cron-auth.ts` that uses `crypto.timingSafeEqual()` after `Buffer.from(header)` length check, return 401 from one shared helper, then call it from each cron route.

### 12. Dev quick-login bakes real staff emails into the client bundle

- **Description:** `app/login/page.tsx:14-23` declares `defaultDevQuickLoginEmails = ["carmen@luxustravel.co.za", "dirk@…", "leonie@…", "monade@…", "douwlien@…"]`. While `canUseDevQuickLogin` is `process.env.NODE_ENV === "development"`, the array is a top-level module constant — `next build` keeps the *string literals* in the bundle even when the surrounding branch is dead-code-eliminated, unless every reader path is gated by `process.env.NODE_ENV`. Anyone fetching `_next/static/chunks/login-…js` from production can enumerate staff accounts to target for password spray.
- **Affected area:** `app/login/page.tsx:14-100`.
- **Likelihood / Impact / Risk:** Medium / Low / **Medium**
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Move the default emails behind `process.env.NEXT_PUBLIC_DEV_QUICK_LOGIN_EMAIL` only (no hard-coded fallback list), or remove the dev-quick-login feature entirely now that prod data exists.

### 13. Hosted Supabase project refs committed in `.env.sync.local.example`

- **Description:** `.env.sync.local.example:10,12` contains real project refs `isxpuhttwzyvjclrnhbg` (dev) and `qlwldfhjfbxliyjvoziu` (prod) as commented examples. While these are not secrets per se, they expose the prod hosted database endpoint and let an attacker target the project’s public API and auth endpoints directly.
- **Affected area:** `.env.sync.local.example:10-13`.
- **Likelihood / Impact / Risk:** High (already in git history) / Low / **Medium**
- **Effort estimate:** Low (replace with placeholders; rotate is not necessary for refs themselves but consider rotating anon/service keys if they were ever pasted alongside).
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Replace project refs with `<dev-project-ref>` / `<prod-project-ref>` placeholders. Audit git history (`git log -p .env.sync.local.example`) for any past pastings of real DB passwords; rotate those passwords if found.

### 14. `images.unoptimized = true`

- **Description:** `next.config.mjs:3-5` disables Next’s image optimization, which also disables the `images.remotePatterns` allowlist and bypasses size/quality enforcement. With the public voucher bucket (finding #4), arbitrary URLs and large payloads can be embedded.
- **Affected area:** `next.config.mjs:3-5`.
- **Likelihood / Impact / Risk:** Medium / Low / **Low-Medium**
- **Effort estimate:** Low.
- **Cost implication:** Low–Medium (Vercel image optimization billing).
- **Scope of fix:** Localised.
- **Recommended fix:** Re-enable image optimization and configure `images.remotePatterns` to allow only the Supabase project host.

### 15. Other transitive dependency vulnerabilities

- **Description:** `pnpm audit` flags additional issues: `ws@<8.20.1` (uninitialised memory disclosure), `uuid@<11.1.1` (missing bounds check), `brace-expansion@<1.1.13` (DoS), `picomatch@<4.0.4` (ReDoS + glob bypass), `postcss@<8.5.10` (XSS via unescaped `</style>` in stringify output).
- **Affected area:** `pnpm-lock.yaml` (transitive).
- **Likelihood / Impact / Risk:** Medium / Low / **Low-Medium**
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Run `pnpm up --latest` for these packages or add `pnpm.overrides` to pin patched versions. Re-run `pnpm audit`.

### 16. Customer search PostgREST `.or()` filter built from user input

- **Description:** `app/api/customers/route.ts:44-49` escapes `,`, `%`, `_` but lets through other PostgREST filter metacharacters (e.g. `)`, `(`, `*` modifiers). The supabase-js `.or(...)` syntax parses commas as branch separators and parentheses as group boundaries; a crafted query string could broaden the resulting filter. Limited blast radius because the result is still scoped by RLS (`createSessionClient`), but the contract is fragile.
- **Affected area:** `app/api/customers/route.ts:44-49`.
- **Likelihood / Impact / Risk:** Low / Medium / **Low-Medium**
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Move to a Postgres RPC `search_customers(q text)` that uses parameterised `ILIKE` and `RETURNS TABLE`, or use `.ilike()` chained with `.or()` on a Whitelisted, fully-escaped value (reject inputs containing `,()`).

### 17. `/api/dev/replay-inbound-email` gate

- **Description:** Only `process.env.NODE_ENV === "production"` gates this insert-side-effect endpoint. If a Vercel preview or QA environment runs with `NODE_ENV=development`/`test`, the route is callable unauthenticated and inserts a fixture-driven booking + customer.
- **Affected area:** `app/api/dev/replay-inbound-email/route.ts:14-44`.
- **Likelihood / Impact / Risk:** Low / Medium / **Low**
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Require authentication + admin role *in addition to* the NODE_ENV check, or move the route under `/api/dev/__only__/replay-inbound-email` and exclude `/api/dev/__only__/**` from the deployed bundle via `next.config.mjs` `pageExtensions` or a build-time guard.

### 18. Committed `linked-remote-types.tmp.ts` schema dump

- **Description:** A 1,454-line file `linked-remote-types.tmp.ts` (UTF-16-encoded type dump of the remote Supabase schema) is committed at the repo root and not referenced from any code or build script. It leaks the internal data model and any column comments to anyone who clones or stars the repo.
- **Affected area:** `linked-remote-types.tmp.ts` (root).
- **Likelihood / Impact / Risk:** High (already public) / Very Low / **Low**
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** `git rm linked-remote-types.tmp.ts` and add `*.tmp.ts` and `linked-remote-types*` to `.gitignore`.

---

## 4. Priority Actions

Ranked by highest risk vs. lowest effort:

1. **Upgrade `next` to `>=16.2.6`** (finding #1) — single dep bump closes 14 advisories including the worst middleware/proxy bypass.
2. **Wire up `middleware.ts`** (finding #5) — rename or re-export `proxy` so session refresh and `/login` redirect actually run.
3. **Lock down `POST /api/enquiries`** (finding #3) — add Zod, drop `linkedCustomerId`, add CAPTCHA + rate-limit before the next public deploy.
4. **Stop accepting SVG uploads into the public bucket** (finding #4) — config + route change; pairs with finding #10.
5. **Upgrade `vitest` and pin `vite`/`lodash` overrides** (findings #2, #6, #7, #15) — one `pnpm up` pass closes multiple advisories.
6. **Add HTTP security headers** (finding #8) — small `next.config.mjs` change buys defence-in-depth for findings #4 and #10.
7. **Raise password floor to 12 chars with complexity, enable admin MFA** (finding #9).
8. **Replace cron secret comparison with `timingSafeEqual`** (finding #11) and **scrub committed staff emails / project refs** (findings #12, #13).
9. **Sanitise template preview HTML** (finding #10), **harden customer search** (finding #16), and **delete the temp type dump** (finding #18).
10. **Tighten dev-replay route to require admin auth** (finding #17), **re-enable image optimisation** (finding #14).
