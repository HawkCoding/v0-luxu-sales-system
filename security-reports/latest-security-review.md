# Security Review — Luxus Sales System

| Field | Value |
|---|---|
| Repository | `hawkcoding/v0-luxu-sales-system` |
| Run date | 2026-06-10 |
| Branch reviewed | `claude/friendly-curie-isdb2a` |
| App version | `3.22` (`lib/version.ts`) |
| Total findings | 16 |
| Overall security posture | **Poor** — multiple unpatched high-severity CVEs in `next` and `vitest`, plus an unauthenticated public endpoint that uses the service role to write the database. |
| Highest-risk issue | **Outdated `next@16.1.6`** — exposed to ~15 advisories including middleware/proxy bypass, SSRF, request smuggling, CSRF bypass and DoS. Fixed in `>= 16.2.6`. |
| Lowest-risk issue | **Hardcoded dev quick-login emails in client bundle** (`app/login/page.tsx:16-23`) — guarded by `NODE_ENV === "development"` and shipped only in dev builds. |

---

## 1. Summary

- **Total vulnerabilities identified:** 16
- **Critical:** 2 (vulnerable `next`, vulnerable `vitest`)
- **High:** 3 (unauthenticated service-role write surface, hardcoded employee credentials in seed/login, weak password policy)
- **Medium:** 6
- **Low:** 5

Posture rationale: the auth and RLS layer is well-considered (RLS-aware `createSessionClient`, role checks in API routes, Zod validation on most boundaries, AES-256-GCM for IMAP/SMTP passwords), but the application is one `pnpm install` away from picking up published exploits for `next` and the public `/api/enquiries` route is a usable attack surface for arbitrary database writes.

---

## 2. Risk Matrix

| # | Issue | Likelihood | Impact | Risk Level |
|---|---|---|---|---|
| 1 | Outdated Next.js 16.1.6 (15+ CVEs incl. middleware bypass, SSRF, request smuggling) | High | High | **Critical** |
| 2 | Vitest 4.0.18 — arbitrary file read/execute via UI server (GHSA, fixed in 4.1.0) | Medium | High | **High** |
| 3 | `POST /api/enquiries` uses `createServiceClient()` (RLS bypass) without auth, Zod validation, rate limit, or CAPTCHA | High | High | **Critical** |
| 4 | Real employee emails + `password123` seeded in `supabase/seed.sql` and hardcoded as defaults in `app/login/page.tsx` | Medium | High | **High** |
| 5 | Weak password policy — 6-character minimum, no complexity, no breach-list check | High | Medium | **High** |
| 6 | No Next.js middleware running — `proxy.ts` is dead code (never imported as `middleware.ts`) | High | Low | **Medium** |
| 7 | No security headers (CSP, X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy) | High | Medium | **Medium** |
| 8 | PostgREST `.or()` filter injection — incomplete escaping of `(`, `)`, `\`, operators | Medium | Medium | **Medium** |
| 9 | `dangerouslySetInnerHTML` rendering unsanitized template `bodyHtml` (`app/app/templates/page.tsx:185`) | Low | High | **Medium** |
| 10 | CRON_SECRET compared with `!==` (non-constant-time) in 5 cron routes | Low | Medium | **Medium** |
| 11 | Customer-import error responses leak Supabase error `code/hint/details` whenever `NODE_ENV !== "production"` | Medium | Low | **Medium** |
| 12 | Service-role key validation only checks for `.` — does not verify it is a service_role JWT vs anon | Low | High | **Low** |
| 13 | Public dev/replay route (`/api/dev/replay-inbound-email`) requires no auth in non-production | Low | Medium | **Low** |
| 14 | No rate limiting on auth/login/password-reset/enquiry endpoints | Medium | Low | **Low** |
| 15 | Hardcoded dev-quick-login employee emails in client bundle | Low | Low | **Low** |
| 16 | Cookie security attributes rely on `@supabase/ssr` defaults — no explicit `Secure`/`SameSite` in app code | Low | Low | **Low** |

Severity ranking (most → least): **1 → 3 → 2 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16**.

---

## 3. Detailed Findings

### 1. Outdated `next@16.1.6` exposed to multiple high-severity advisories  *(Critical)*

- **Description:** `pnpm audit` reports 15+ Next.js advisories on the pinned version, including:
  - GHSA-ggv3-7p47-pfv8 — HTTP request smuggling in rewrites (CVE-2026-29057)
  - Middleware/Proxy bypass via segment-prefetch routes (high)
  - Middleware/Proxy bypass via dynamic route parameter injection (high)
  - SSRF via WebSocket upgrades (high)
  - DoS via Server Components and connection exhaustion (high)
  - `null` origin can bypass Server Actions CSRF checks (moderate)
  - XSS in beforeInteractive scripts / via CSP nonce handling (moderate)
- **Affected area:** `package.json` (`"next": "16.1.6"`), `pnpm-lock.yaml`.
- **Likelihood / Impact / Risk:** High / High / **Critical**.
- **Effort estimate:** Low (bump dep + re-run tests).
- **Cost implication:** Low.
- **Scope of fix:** Localised (dependency bump, lockfile refresh).
- **Recommended fix:** Pin `next` to `>= 16.2.6` (current stable line) — `pnpm add next@^16.2.6`, then `pnpm install`, run typecheck + full QA. Repeat for any peer types that need bumping.

### 2. `vitest@4.0.18` — arbitrary file read & execute via UI server  *(High)*

- **Description:** GHSA flagged on `vitest >=4.0.0 <4.1.0` — when the Vitest UI server is listening, an attacker on the same host can cause arbitrary file read and execution. Fixed in `>= 4.1.0`. Devdep only, but still runs on CI and developer machines.
- **Affected area:** `package.json` (`devDependencies`), `@vitest/coverage-v8@4.0.18`.
- **Likelihood / Impact / Risk:** Medium / High / **High**.
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** `pnpm add -D vitest@^4.1.0 @vitest/coverage-v8@^4.1.0`.

### 3. `POST /api/enquiries` is an unauthenticated service-role write surface  *(Critical)*

- **Description:** `app/api/enquiries/route.ts:410-704` accepts JSON from the public web form, parses it via `req.json()` with **no Zod schema**, then uses `createServiceClient()` (RLS bypassed) to:
  - `upsert` rows into `customers` (including email/phone/country)
  - `insert` into `bookings` with arbitrary `purpose`, `extracted_json`, `additional_services_details`, `terms_accepted`, etc.
  - `insert` `booking_suites`, `travellers`, `booking_transport_requests`, `booking_vehicle_rental_details`, `quotes`, `quote_line_items`, `audit_logs`.
  - The route also makes lookup queries (`packages`, `suppliers`, `routes`, country aliases) per submission with no rate limit.
- **Specific weaknesses:**
  - No authentication or origin check (intentional for the public form), but no CAPTCHA or token-based throttle either.
  - No request schema validation; only ad-hoc `typeof` checks per field — types like `noOfAdults`, `extraNights`, `transportRequests[]` accept anything that survives the `typeof` filter.
  - No size cap on `body.travellers`, `body.childTravellers`, `body.transportRequests`, or `body.rawText` — an attacker can post massive arrays or megabyte-sized text that gets persisted and copied into `audit_logs.meta_json`.
  - `audit_logs` rows are written with `actor: user?.email ?? "consultant"` from a public input branch — attackers can pollute the audit trail.
- **Affected area:** `app/api/enquiries/route.ts`.
- **Likelihood / Impact / Risk:** High / High / **Critical**.
- **Effort estimate:** Medium.
- **Cost implication:** Low–Medium.
- **Scope of fix:** Localised.
- **Recommended fix:**
  1. Add a strict Zod schema for the public payload (mirror the shape of the existing `enquiryFilterSchema` discipline) — include `max()` limits on every text field and array.
  2. Add a per-IP rate limit (e.g. Upstash Ratelimit, Vercel Edge Config, or a simple in-process token bucket keyed off `x-forwarded-for`).
  3. Add a CAPTCHA (Turnstile / hCaptcha) verifying server-side before the insert.
  4. Reject submissions with bodies > ~50 KB.
  5. Tag audit log entries created from public submissions with a fixed `actor` value (e.g. `"public_enquiry_form"`) so attacker-supplied `user?.email` cannot be spoofed (no public path sets that, but keep the invariant explicit).

### 4. Real employee credentials seeded with default password  *(High)*

- **Description:** `supabase/seed.sql:26-30` seeds the **production** employee email addresses (`carmen@…`, `leonie@…`, `dirk@…`, `monade@…`, `douwlien@luxustravel.co.za`) into local Supabase with `extensions.crypt('password123', …)`. The same emails and the password `password123` are also baked into the client bundle at `app/login/page.tsx:16-23` as `defaultDevQuickLoginEmails` / `defaultDevQuickLoginPasswords`. Anyone who clones the repo learns the company's user roster.
- **Why this matters in production:** If staff originally used these defaults and were never forced to rotate (the `POST /api/users` admin-create endpoint accepts ≥6-char passwords), credential stuffing against the production login is trivial.
- **Affected area:** `supabase/seed.sql:1-30`, `app/login/page.tsx:14-100`, `.env.local.example:23-24`.
- **Likelihood / Impact / Risk:** Medium / High / **High**.
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:**
  1. Replace real emails in `seed.sql` with obviously fictitious ones (`alice@example.test`, `bob@example.test`).
  2. Remove the hardcoded `defaultDevQuickLogin*` list and require explicit configuration via `localStorage` or `NEXT_PUBLIC_DEV_QUICK_LOGIN_*` env vars.
  3. Force password reset on first login for any production user who was provisioned with the default password.

### 5. Weak password policy on user creation and reset  *(High)*

- **Description:** `app/api/users/route.ts:20` requires `password: z.string().min(6)`. `app/api/users/[userId]/password/route.ts:59` enforces the same 6-character minimum. No complexity, length-cap, or breached-password check.
- **Affected area:** `app/api/users/route.ts`, `app/api/users/[userId]/password/route.ts`.
- **Likelihood / Impact / Risk:** High / Medium / **High**.
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Raise minimum to **12** characters, require at least one upper/lower/digit, and either:
  - integrate `zxcvbn` (or `@zxcvbn-ts/core`) and reject scores < 3, or
  - check against the HIBP "Pwned Passwords" k-anonymity API.

  Also lengthen Supabase `auth.minimum_password_length` in `supabase/config.toml` so the same rule is enforced at the auth layer.

### 6. No active Next.js middleware — `proxy.ts` is dead code  *(Medium)*

- **Description:** `proxy.ts` (root) exports a `proxy(request)` function and a `config.matcher`, clearly authored as Next.js middleware (handles Supabase session refresh and redirects logged-in users away from `/login`). Next.js only auto-loads `middleware.ts` (or `src/middleware.ts`); a Glob for `**/middleware.ts` returns no matches, and no file imports `proxy.ts`. Result: the session-refresh + redirect behaviour never runs.
- **Affected area:** `proxy.ts` (entire file).
- **Likelihood / Impact / Risk:** High / Low / **Medium**.
- **Effort estimate:** Low (rename to `middleware.ts` and export as `middleware`).
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Rename `proxy.ts` → `middleware.ts` and rename the exported function to `middleware`. Then move the security-header injection (CSP, X-Frame-Options, etc — see Finding 7) into the same middleware.

### 7. No security headers configured anywhere  *(Medium)*

- **Description:** `next.config.mjs` declares only `images.unoptimized: true`. There are no `headers()` entries, and `vercel.json` defines only cron jobs. A grep across the codebase for `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, and `Referrer-Policy` returns zero hits.
- **Affected area:** `next.config.mjs`, `vercel.json`, missing `middleware.ts`.
- **Likelihood / Impact / Risk:** High / Medium / **Medium**.
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Add a `headers()` block to `next.config.mjs` setting at minimum:
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY` (or `Content-Security-Policy: frame-ancestors 'none'`)
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - A CSP with `default-src 'self'`, allowlisting only Supabase, Resend, and Vercel Analytics origins.

### 8. PostgREST `.or()` filter injection via partially-escaped user input  *(Medium)*

- **Description:** Five locations interpolate user input into PostgREST `or=()` filter strings, escaping only `%`, `_`, and `,`:
  - `app/api/customers/route.ts:45-48`
  - `app/api/locations/route.ts:162`
  - `app/api/suppliers/route.ts:30`
  - `app/api/packages/[slug]/helpers.ts:56`
  - `lib/audit.ts:252-255`

  Parentheses, backslashes, and PostgREST operator tokens (`.eq.`, `.is.`, `.in.`, etc.) are not escaped. An authenticated user could craft a `search` value that breaks out of `ilike` into other filter operators, broadening the result set (e.g. `actor.eq.SYSTEM` slipping into the audit list).
- **Affected area:** Listed files above.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**.
- **Effort estimate:** Low–Medium.
- **Cost implication:** Low.
- **Scope of fix:** Cross-cutting (5 files, same fix pattern).
- **Recommended fix:**
  1. Replace `.or(\`…ilike.%${escaped}%…\`)` with PostgREST's `or` helper that takes structured filter clauses, or use parameter binding via the `rpc` interface.
  2. If the string-builder must stay, restrict `search` to `^[A-Za-z0-9 @._-]{1,80}$` (whitelist) before interpolation.

### 9. Stored XSS sink in template preview  *(Medium)*

- **Description:** `app/app/templates/page.tsx:185` renders `preview?.bodyHtml` with `dangerouslySetInnerHTML`. `bodyHtml` is stored verbatim by `PATCH /api/templates` (`app/api/templates/route.ts:68`) — Zod only enforces a 200 KB length cap. An admin/manager account compromise (or a malicious insider in those roles) can persist JavaScript that fires for every other admin/manager viewing the preview.
- **Affected area:** `app/app/templates/page.tsx`, `app/api/templates/route.ts`.
- **Likelihood / Impact / Risk:** Low / High / **Medium**.
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Sanitise `bodyHtml` with `DOMPurify` (or `isomorphic-dompurify`) before rendering, and apply the same sanitiser server-side on write. Pair with a strict CSP (Finding 7) so any future sink is mitigated in depth.

### 10. CRON_SECRET compared with `!==` (non-constant time)  *(Medium)*

- **Description:** All five cron routes (`app/api/cron/{email-sync,pipeline-auto-close,backup,payment-reminders,quote-follow-ups}/route.ts`) use `authHeader !== \`Bearer ${process.env.CRON_SECRET}\``. JavaScript string comparison short-circuits on the first mismatch — a timing oracle. Over the public internet, jitter dominates and this is hard to exploit, but the fix is one line.
- **Affected area:** Five cron route files.
- **Likelihood / Impact / Risk:** Low / Medium / **Medium**.
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Cross-cutting (5 files).
- **Recommended fix:** Extract a helper:

  ```ts
  import { timingSafeEqual } from "node:crypto"
  export function isAuthorisedCron(authHeader: string | null): boolean {
    const expected = process.env.CRON_SECRET
    if (!expected || !authHeader?.startsWith("Bearer ")) return false
    const provided = Buffer.from(authHeader.slice(7))
    const expectedBuf = Buffer.from(expected)
    return provided.length === expectedBuf.length && timingSafeEqual(provided, expectedBuf)
  }
  ```

  Call from each cron route.

### 11. Customer-import responses leak Supabase error internals outside production  *(Medium)*

- **Description:** `app/api/customers/import/route.ts:66` sets `localDiagnosticsEnabled = process.env.NODE_ENV !== "production"`. When true, every import error response includes the Supabase `message`, `code`, `details`, and `hint`. If a staging or preview deployment uses `NODE_ENV=development` (Vercel previews default to `production`, but custom builds may differ), this hands attackers schema fingerprints (column names, constraint names, RLS policy clues).
- **Affected area:** `app/api/customers/import/route.ts`.
- **Likelihood / Impact / Risk:** Medium / Low / **Medium**.
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Gate diagnostics behind an explicit `process.env.DEBUG_IMPORT === "1"` rather than negation of `production`, and always log the rich details server-side via the existing `console.error` line.

### 12. Service-role key validation only checks for `.`  *(Low)*

- **Description:** `lib/supabase/server.ts:54-57` rejects only if the value does not contain `.`. Any anon JWT (also contains dots) would pass and silently demote the "service" client to anon — every RLS-bypass code path would then silently fail-open as RLS-enforced (which sounds safe, but masks misconfiguration of e.g. the `/api/enquiries` POST and `restore_backup_snapshot` RPC).
- **Affected area:** `lib/supabase/server.ts`.
- **Likelihood / Impact / Risk:** Low / High / **Low**.
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Decode the JWT (no signature check needed — this is a sanity check) and assert `payload.role === "service_role"` before using.

### 13. Dev replay route requires no auth  *(Low)*

- **Description:** `app/api/dev/replay-inbound-email/route.ts:15` only checks `process.env.NODE_ENV === "production"`. On developer machines and previews, any caller can POST to it and trigger a synthetic booking insert via the service client. Acceptable in pure local dev, but if a Vercel preview deployment is reachable over the internet it becomes a write surface.
- **Affected area:** `app/api/dev/replay-inbound-email/route.ts`.
- **Likelihood / Impact / Risk:** Low / Medium / **Low**.
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Additionally require an authenticated admin session (`requireRole(["admin"])`) so the route is safe even on previews.

### 14. No rate limiting anywhere  *(Low)*

- **Description:** Grep for `ratelimit|rate-limit|throttle` returns zero hits. Login (Supabase Auth has its own throttling, but only client-side IP if not behind a proxy), password reset, document upload, and enquiry creation are all unmetered.
- **Affected area:** Entire `app/api/**`.
- **Likelihood / Impact / Risk:** Medium / Low / **Low** (raised by interaction with Finding 3).
- **Effort estimate:** Medium.
- **Cost implication:** Low–Medium.
- **Scope of fix:** Cross-cutting.
- **Recommended fix:** Adopt Upstash Ratelimit or Vercel KV for a per-route, per-IP token bucket. Start with login (5/min/IP), password reset (3/hour/email), enquiries (10/hour/IP), and uploads (30/min/user).

### 15. Hardcoded dev quick-login emails compiled into the client bundle  *(Low)*

- **Description:** `app/login/page.tsx:16-23` ships real employee emails into the client bundle. The button is hidden when `NODE_ENV !== "development"`, but the strings remain in the source.
- **Affected area:** `app/login/page.tsx`.
- **Likelihood / Impact / Risk:** Low / Low / **Low**.
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Wrap the entire `DEV_QUICK_LOGIN_*` block behind a build-time `process.env.NODE_ENV === "development"` check so it is tree-shaken out of production bundles; remove the real-email defaults entirely (require `localStorage` or env config).

### 16. Cookie security attributes rely entirely on `@supabase/ssr` defaults  *(Low)*

- **Description:** Neither `lib/supabase/server.ts` nor `proxy.ts` overrides cookie options. `@supabase/ssr` does set `httpOnly`, `secure`, and `sameSite=lax` by default in production, but there is no explicit guarantee in the codebase nor a regression test. The custom `app/api/logout/route.ts` also relies on the SSR client's defaults when issuing `setAll`.
- **Affected area:** `lib/supabase/server.ts`, `proxy.ts`, `app/api/logout/route.ts`.
- **Likelihood / Impact / Risk:** Low / Low / **Low**.
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** When forwarding `cookiesToSet`, explicitly merge `{ secure: true, sameSite: "lax", httpOnly: true }` for Supabase auth cookies in production. Add a Vitest assertion against the response cookies to prevent regression.

---

## 4. Priority Actions

Address in this order — these maximise risk reduction for minimal effort.

1. **Bump `next` to `>= 16.2.6`** and `vitest`/`@vitest/coverage-v8` to `>= 4.1.0`. *(Findings 1, 2 — Critical/High, Low effort.)*
2. **Lock down `POST /api/enquiries`**: Zod schema, body-size cap, per-IP rate limit, CAPTCHA. *(Finding 3 — Critical, Medium effort.)*
3. **Rotate any production passwords still set to `password123`**, scrub real employee emails from `supabase/seed.sql` and `app/login/page.tsx`, force a password reset on those accounts. *(Finding 4 — High, Low effort.)*
4. **Tighten password policy** to ≥12 chars + complexity, integrate breached-password check; update Supabase `minimum_password_length`. *(Finding 5 — High, Low effort.)*
5. **Rename `proxy.ts` → `middleware.ts`** so it actually runs; add the security-header block (Findings 6, 7 — Medium, Low effort).
6. **Sanitise template `bodyHtml`** on read and write, and replace `.or()` string-interpolation with structured filters or strict whitelisting. *(Findings 8, 9 — Medium, Low–Medium effort.)*
7. Switch CRON_SECRET comparisons to `timingSafeEqual`, gate import diagnostics behind an explicit env flag, harden `createServiceClient` validation, require auth on `/api/dev/replay-inbound-email`. *(Findings 10–13 — Medium/Low, Low effort.)*
8. Add a thin rate-limit layer for login, password reset, and document upload. *(Finding 14.)*
9. Strip the dev-quick-login defaults from the client bundle; pin Supabase auth cookie options explicitly. *(Findings 15, 16.)*

---

_Generated by the automated security review skill._
