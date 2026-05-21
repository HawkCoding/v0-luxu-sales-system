# Security Review — Luxus Sales System

| Field                | Value                                                                 |
|----------------------|-----------------------------------------------------------------------|
| Repository           | `hawkcoding/v0-luxu-sales-system`                                     |
| Branch reviewed      | `claude/friendly-curie-pR6Ll`                                         |
| Run date             | 2026-05-21                                                            |
| Overall posture      | **Moderate** (workable baseline, several high-impact gaps to close)   |
| Highest-risk issue   | Outdated `next@16.1.6` — multiple unpatched CVEs (Middleware bypass, SSRF, XSS, DoS) |
| Lowest-risk issue    | Non‑constant‑time comparison of `CRON_SECRET`                        |
| Total findings       | **15**                                                                |

---

## 1. Summary

The application has a reasonable security skeleton (Supabase RLS, Zod validation, role checks in most API routes, AES‑256‑GCM credential encryption, signed‑out flow, server‑side layout guard).
The single biggest exposure is the **Next.js dependency**, which is two minor versions behind and carries roughly 16 unpatched advisories — several of them HIGH (Middleware/Proxy bypass, SSRF on WebSocket upgrades, DoS, XSS).
Beneath that, the **Row‑Level Security policy model is effectively permissive** for the core business tables — RLS only checks that the caller is `authenticated`, leaving role enforcement entirely to the API layer. Any holder of an anon JWT can talk to PostgREST directly and bypass those API checks.
The **public `/api/enquiries` route** ships with no input schema and uses the service-role client, providing a direct unauthenticated write path into `customers`, `bookings`, `quotes`, etc.
The remaining findings are smaller (missing security headers, weak password policy, no rate-limiting, etc.) but compound the picture.

---

## 2. Risk Matrix

| # | Issue                                                                                    | Likelihood | Impact | Risk     |
|---|------------------------------------------------------------------------------------------|------------|--------|----------|
| 1 | Outdated `next@16.1.6` — multiple HIGH-severity CVEs                                     | High       | High   | **High** |
| 2 | Permissive RLS policies (`USING (true)`) on core business tables                         | Medium     | High   | **High** |
| 3 | Public `/api/enquiries` — no auth, no Zod schema, service-role client                    | High       | Medium | **High** |
| 4 | Vulnerable transitive deps (`lodash`, `vite`, `picomatch`, `ws`, `postcss`)              | Medium     | High   | **High** |
| 5 | XSS via `dangerouslySetInnerHTML` rendering of template `body_html`                      | Medium     | Medium | **Medium** |
| 6 | Supabase signups enabled + 6-char minimum password                                       | Medium     | Medium | **Medium** |
| 7 | Missing security response headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)   | Medium     | Medium | **Medium** |
| 8 | Dev quick‑login defaults (real emails + `password123`) shipped in client bundle          | Low        | Medium | **Medium** |
| 9 | No rate limiting on `/api/enquiries`, login, password reset endpoints                    | Medium     | Medium | **Medium** |
| 10 | `/api/data` and `GET /api/jobs/[id]` return no 401 — rely entirely on RLS               | Medium     | Low    | **Low**  |
| 11 | `EMAIL_CREDENTIAL_ENCRYPTION_KEY` — single static key, no rotation                      | Low        | High   | **Medium** |
| 12 | PostgREST `.or()` search input only partially escaped in `/api/customers` GET           | Low        | Medium | **Low**  |
| 13 | Customer-import diagnostics leak DB error details when `NODE_ENV !== "production"`      | Low        | Medium | **Low**  |
| 14 | Mailpit fallback transport uses plaintext SMTP (`secure: false`)                        | Low        | Low    | **Low**  |
| 15 | `CRON_SECRET` compared with `!==` (non-constant-time)                                   | Low        | Low    | **Low**  |

Ranking, most → least severe: **1 → 4 → 3 → 2 → 5 → 11 → 7 → 6 → 9 → 8 → 13 → 12 → 10 → 14 → 15**.

---

## 3. Detailed Findings

### 1. Outdated `next@16.1.6` — multiple unpatched CVEs

- **Description**: `pnpm audit` reports 16+ advisories against the pinned `next@16.1.6` (declared in `package.json:96`). The cluster includes high‑severity issues fixed only in `16.2.6`: Middleware/Proxy bypass via segment-prefetch and dynamic route parameter injection, SSRF via WebSocket upgrades, DoS via Server Components / Cache Components / Image Optimization API, XSS in App Router with CSP nonces and `beforeInteractive` scripts, CSRF via `Origin: null`, HTTP request smuggling on rewrites, cache poisoning in RSC responses and Middleware redirects.
- **Affected Area**: `package.json` (entire app, including `proxy.ts` middleware path).
- **Likelihood / Impact / Risk**: High / High / **High**
- **Effort Estimate**: Low (single dependency bump + smoke test).
- **Cost Implication**: Low.
- **Scope of Fix**: Localised, but exercises every route.
- **Recommended Fix**: `pnpm add next@^16.2.6`, regenerate the lockfile, re-run the full test suite and a manual smoke pass through `/login`, `/app`, API routes, and the cron paths. Confirm no `serverActions.allowedOrigins` entry is `'null'`. Re-deploy.

---

### 2. Permissive RLS policies on core business tables

- **Description**: `supabase/migrations/20260308095136_remote_schema.sql:1339-1616` enables RLS on `customers`, `bookings`, `booking_suites`, `quotes`, `quote_line_items`, `payments`, `documents`, `correspondences`, `itineraries`, `travellers`, `pipeline_history`, `audit_logs` — and then attaches policies of the form `FOR <ALL OPS> TO authenticated USING (true) WITH CHECK (true)`. Role-based gating (`auth_has_role`) is only applied to a few reference tables (`packages`, `routes`, `templates`, etc.) and to `profiles`. Net effect: any holder of a valid Supabase JWT — including a `readonly` profile, or a brand-new self-signed-up auth user (see finding 6) — can talk to PostgREST directly via `NEXT_PUBLIC_SUPABASE_URL` + anon key, and read, insert, update or delete every customer, booking, payment, quote and audit row. The role checks in `lib/api/auth.ts` and `lib/role-context.tsx:14-48` only protect calls that go through the Next.js API routes; PostgREST is reachable independently.
- **Affected Area**: `supabase/migrations/20260308095136_remote_schema.sql` (and follow-ons that mirror the same `biz_*` pattern, e.g. `audit_logs` `al_*`, `pipeline_history` `ph_*`, `invoices`, `inbound_email_*`, `booking_transport_requests`).
- **Likelihood / Impact / Risk**: Medium / High / **High**
- **Effort Estimate**: Medium (re-design policies per table; per-role policy split).
- **Cost Implication**: Medium.
- **Scope of Fix**: Cross-cutting (all RLS policies + careful regression of API routes).
- **Recommended Fix**: Replace `USING (true)` with role-aware predicates that mirror `lib/role-context.tsx`. At minimum:
  - `SELECT` for `authenticated` where role is in `['admin','manager','consultant','readonly']`.
  - `INSERT / UPDATE` only where role is in `['admin','manager','consultant']`.
  - `DELETE` only for `['admin','manager']` (or `admin` for sensitive tables — payments, audit_logs).
  - `audit_logs` should be **insert-only for non-admins** and `SELECT` gated on `auth_has_role(['admin','manager'])` to match `lib/audit.ts:getAuditCutoffDate` and the `canReadAuditLogs` check in `app/api/data/route.ts:41`.
  - Re-use the existing `auth_has_role(text[])` SECURITY DEFINER function from `20260308095136_remote_schema.sql:166-175` to keep policies concise.

---

### 3. Public `/api/enquiries` — no auth, no Zod schema, service-role client

- **Description**: `app/api/enquiries/route.ts:301-578` is documented as a public intake endpoint. The `POST` handler instantiates `createServiceClient()` (bypassing RLS — `lib/supabase/server.ts:45`), parses an unauthenticated JSON body, and writes into `customers`, `bookings`, `booking_suites`, `travellers`, `booking_transport_requests`, `quotes`, `quote_line_items`, `audit_logs` based purely on properties read off `body` (no Zod schema). There is no captcha, no rate limit, no body-size cap, no origin check. The route stores user-supplied `body.rawText` into `bookings.raw_text` and an arbitrary object into `bookings.extracted_json`. An attacker can:
  - Mass-create junk customers + bookings to exhaust DB / storage and pollute the salesperson pipeline.
  - Plant arbitrary JSON in `extracted_json` (e.g., `historical_import.imported_via = "supplier_csv"` to collide with the duplicate-detection logic in `/api/customers/import`).
  - Trigger expensive lookups (`findRouteId`, `findPackageId`, `findHotelSupplierId`, `loadPackageDetail`) for every request.
- **Affected Area**: `app/api/enquiries/route.ts:301-578`.
- **Likelihood / Impact / Risk**: High / Medium / **High**
- **Effort Estimate**: Medium.
- **Cost Implication**: Low–Medium.
- **Scope of Fix**: Localised.
- **Recommended Fix**:
  1. Add a strict Zod schema for the public body (mirroring the existing internal new-enquiry validator) with field caps (e.g. `email.max(255)`, `rawText.max(20_000)`, `noOfAdults.int().max(20)`).
  2. Add edge rate limiting per IP + per email (e.g. Upstash Ratelimit or `@vercel/firewall`), and a body-size limit via `export const maxDuration` / a leading `req.headers.get('content-length')` guard.
  3. Add a CAPTCHA (hCaptcha / Turnstile) — Supabase config already has `auth.captcha` available; mirror that here.
  4. Move the public route off the service-role client by introducing a single SECURITY DEFINER RPC that performs only the safe inserts.
  5. Add an explicit allow-list for the source value (`source = "web_form" | "paste_import"` — currently inferred from `body.rawText`, easily spoofed).

---

### 4. Vulnerable transitive dependencies

- **Description**: `pnpm audit` reports HIGH/MODERATE issues in transitive deps beyond Next.js:
  - `lodash <=4.17.23` — code injection via `_.template` (high) and prototype pollution via `_.unset` / `_.omit` (moderate).
  - `vite >=7.1.0 <=7.3.1` — `server.fs.deny` bypass (high) and arbitrary file read via dev-server WebSocket (high). Dev-only, but a poisoned/local-network attacker on a developer machine can read arbitrary files.
  - `picomatch >=4.0.0 <4.0.4` — ReDoS via extglob quantifiers (high) and POSIX method injection (moderate).
  - `ws >=8.0.0 <8.20.1` — uninitialized memory disclosure (moderate); transitively pulled in by Supabase realtime / nodemailer.
  - `postcss <8.5.10` — XSS via unescaped `</style>` in stringify output (moderate); build-time, but affects any user-supplied CSS in voucher templates.
  - `brace-expansion <1.1.13` — DoS via zero-step sequence (moderate).
- **Affected Area**: `package.json`, `pnpm-lock.yaml`.
- **Likelihood / Impact / Risk**: Medium / High / **High**
- **Effort Estimate**: Low–Medium (most are transitive — try `pnpm up`; pin via `pnpm.overrides` if a parent dep won't release).
- **Cost Implication**: Low.
- **Scope of Fix**: Localised (lockfile).
- **Recommended Fix**: Run `pnpm up --recursive --latest` for the listed leaves and rerun `pnpm audit`. Where parents have not released, add a `pnpm.overrides` block in `package.json` pinning `lodash`, `picomatch`, `ws`, `postcss`, `brace-expansion` to the patched versions. After bumping, re-run `pnpm test:ci` and `pnpm build`.

---

### 5. XSS via `dangerouslySetInnerHTML` rendering of template `body_html`

- **Description**: `app/app/templates/page.tsx:185` renders `preview.bodyHtml` straight into the DOM with `dangerouslySetInnerHTML` and no sanitiser. `body_html` is editable by anyone with `edit:templates` (admin only — `lib/role-context.tsx:40`) but is then echoed back via `/api/templates` to admins and managers. Because `correspondences.body_html` and `templates.body_html` flow through the same string (see `app/api/correspondence/route.ts:130` and `app/api/data/route.ts:274`), any other surface that later renders these strings without sanitising — including `audit-log-view.tsx`, `job-correspondence-tab.tsx`, or any future preview — becomes a one-hop stored XSS against admins.
- **Affected Area**: `app/app/templates/page.tsx:185` (and any future `dangerouslySetInnerHTML` consumer of `body_html`).
- **Likelihood / Impact / Risk**: Medium / Medium / **Medium**
- **Effort Estimate**: Low.
- **Cost Implication**: Low.
- **Scope of Fix**: Localised, but worth a codebase-wide sweep for `dangerouslySetInnerHTML`.
- **Recommended Fix**: Sanitise with `isomorphic-dompurify` (or `sanitize-html`) before rendering — wrap in a `<SafeHtml html={...}/>` component used everywhere `body_html` is shown. Apply a strict allow-list (no `<script>`, no event-handlers, no `javascript:` URLs). Pair with finding 7 (CSP) so a future regression is mitigated by the browser.

---

### 6. Supabase signups enabled + 6-character minimum password

- **Description**: `supabase/config.toml:184` sets `enable_signup = true`, `config.toml:190` sets `minimum_password_length = 6`, and `config.toml:193` leaves `password_requirements = ""`. The same 6-character minimum is hard-coded in `app/api/users/route.ts:20` and `app/api/users/[userId]/password/route.ts:59`. Combined with finding 2, a self-signed-up auth user can call PostgREST directly and reach the business tables. Even without finding 2, weak passwords expose existing admin/manager accounts to credential stuffing.
- **Affected Area**: `supabase/config.toml`, `app/api/users/route.ts:20`, `app/api/users/[userId]/password/route.ts:59`.
- **Likelihood / Impact / Risk**: Medium / Medium / **Medium**
- **Effort Estimate**: Low.
- **Cost Implication**: Low.
- **Scope of Fix**: Localised.
- **Recommended Fix**: In `supabase/config.toml` set `enable_signup = false`, `[auth.email].enable_signup = false`, `minimum_password_length = 12`, `password_requirements = "lower_upper_letters_digits_symbols"`. Mirror the 12-char minimum in the two Zod schemas. Enable `[auth.captcha]` for the auth API.

---

### 7. Missing security response headers

- **Description**: `next.config.mjs` defines no `headers()` block — production responses ship with no `Content-Security-Policy`, no `Strict-Transport-Security`, no `X-Frame-Options`, no `X-Content-Type-Options`, no `Referrer-Policy`, no `Permissions-Policy`. The login form, password reset, customer detail page (PII), and audit log views are all clickjackable and have no defence-in-depth for the XSS in finding 5.
- **Affected Area**: `next.config.mjs`.
- **Likelihood / Impact / Risk**: Medium / Medium / **Medium**
- **Effort Estimate**: Low.
- **Cost Implication**: Low.
- **Scope of Fix**: Localised — but verify Supabase, Resend, and Vercel Analytics origins are allow-listed in the CSP.
- **Recommended Fix**: Add a `headers()` async function in `next.config.mjs` returning at minimum:
  - `Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-...' https://va.vercel-scripts.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.resend.com; img-src 'self' data: https://*.supabase.co; style-src 'self' 'unsafe-inline'; frame-ancestors 'none';`
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`

---

### 8. Dev quick-login defaults baked into client bundle

- **Description**: `app/login/page.tsx:16-23` hard-codes real consultant email addresses (`carmen@luxustravel.co.za`, `dirk@luxustravel.co.za`, `leonie@luxustravel.co.za`, `monade@luxustravel.co.za`, `douwlien@luxustravel.co.za`) and the default password `password123` directly in the source. Although the button is gated by `process.env.NODE_ENV === "development"` (lines 15, 56, 210), the email list ships in every JS bundle and is extractable from the source maps that Vercel publishes by default. The convention also signals that those real production accounts may still hold `password123` in some environments.
- **Affected Area**: `app/login/page.tsx:14-100`.
- **Likelihood / Impact / Risk**: Low / Medium / **Medium**
- **Effort Estimate**: Low.
- **Cost Implication**: Low.
- **Scope of Fix**: Localised.
- **Recommended Fix**: Move the DEV_QUICK_LOGIN block behind a build-time `process.env.NEXT_PUBLIC_ENABLE_DEV_QUICK_LOGIN === "true"` flag that is unset in production, *and* drop the literal email/password defaults so they read entirely from `localStorage` / dev-only env vars (already supported by the file). Force-rotate the listed accounts and ensure none still uses `password123`. Confirm Vercel `Source Maps for Browser` is disabled in production.

---

### 9. No rate limiting on `/api/enquiries`, login, password reset

- **Description**: There is no middleware-level rate limit anywhere — `proxy.ts:29-78` only refreshes Supabase cookies. Supabase has rate-limits configured (`config.toml:195-209`) but they cover only its own auth endpoints (signups, OTP, token refresh), not custom routes. `/api/enquiries`, `/api/users/[userId]/password`, and login (which is purely client-side Supabase auth) have no per-IP/per-account throttling.
- **Affected Area**: `proxy.ts`, `app/api/enquiries/route.ts`, `app/api/users/[userId]/password/route.ts`, login flow.
- **Likelihood / Impact / Risk**: Medium / Medium / **Medium**
- **Effort Estimate**: Medium.
- **Cost Implication**: Low–Medium (Upstash free tier covers small volumes).
- **Scope of Fix**: Cross-cutting (one rate-limit helper, applied per route).
- **Recommended Fix**: Add an Upstash Redis–backed Ratelimit helper in `lib/rate-limit.ts` and call it at the top of `/api/enquiries`, `/api/users`, `/api/users/[userId]/password`, `/api/customers/import`. Set Supabase `[auth.captcha]` to require Turnstile for sign-in.

---

### 10. `/api/data` and `GET /api/jobs/[id]` rely entirely on RLS

- **Description**: `app/api/data/route.ts:27-130` reads `customers`, `bookings`, `profiles`, `payments`, etc., without any explicit `if (!user) return 401`. `app/api/jobs/[id]/route.ts:77-87` is the same. When combined with the permissive RLS in finding 2, this means any holder of a valid auth JWT (including `readonly` and self-signed-up users) gets the full customer/booking dump in one call.
- **Affected Area**: `app/api/data/route.ts`, `app/api/jobs/[id]/route.ts`.
- **Likelihood / Impact / Risk**: Medium / Low / **Low** (Low on its own; compounds with finding 2 to High).
- **Effort Estimate**: Low.
- **Cost Implication**: Low.
- **Scope of Fix**: Localised.
- **Recommended Fix**: Add `requireUser()` (from `lib/api/auth.ts`) at the top of both routes; return 401 / 403 explicitly. Once finding 2 is fixed this is also a defence-in-depth fast-fail.

---

### 11. `EMAIL_CREDENTIAL_ENCRYPTION_KEY` — single static key, no rotation

- **Description**: `lib/inbound-email/crypto.ts:6-14` derives the AES-256-GCM key as `sha256(EMAIL_CREDENTIAL_ENCRYPTION_KEY)` — one static key for every IMAP password ever stored. There is no per-record salt or AAD, no key versioning beyond the literal `"v1"` prefix in the ciphertext envelope (`crypto.ts:22`), and no rotation flow. Compromise of `EMAIL_CREDENTIAL_ENCRYPTION_KEY` decrypts every supplier mailbox credential in `inbound_email_accounts.password_encrypted`.
- **Affected Area**: `lib/inbound-email/crypto.ts`, `app/api/settings/inbound-email/accounts/route.ts:84`.
- **Likelihood / Impact / Risk**: Low / High / **Medium**
- **Effort Estimate**: Medium.
- **Cost Implication**: Low.
- **Scope of Fix**: Localised but touches every encrypted row on rotation.
- **Recommended Fix**: Introduce a `kid` (key id) field in the envelope, support multiple keys in an env-driven keyring, and add a one-shot re-encrypt script for rotation. Store the master key in a managed secret store (Vercel Encrypted Env / Supabase Vault). Use the row's `id` as additional authenticated data (`cipher.setAAD`) to bind ciphertext to the row.

---

### 12. PostgREST `.or()` search input only partially escaped

- **Description**: `app/api/customers/route.ts:39-41` builds a PostgREST `or()` filter from a user-supplied search string after only `,`, `%`, and `_` are escaped:
  ```
  const escaped = query.replaceAll(",", " ").replaceAll("%", "\\%").replaceAll("_", "\\_")
  customerQuery = customerQuery.or(
    `first_name.ilike.%${escaped}%,last_name.ilike.%${escaped}%,email.ilike.%${escaped}%,phone.ilike.%${escaped}%`,
  )
  ```
  Parentheses, dots, and `.like.` / `.eq.` separators are not escaped, so a crafted query (e.g. `)),phone.eq.123456789`) can inject additional filter clauses against the same columns. Real impact is bounded because the surrounding endpoint already only returns customer rows the caller can see under RLS, but it still allows the caller to probe arbitrary equality matches.
- **Affected Area**: `app/api/customers/route.ts:39-43`.
- **Likelihood / Impact / Risk**: Low / Medium / **Low**
- **Effort Estimate**: Low.
- **Cost Implication**: Low.
- **Scope of Fix**: Localised.
- **Recommended Fix**: Switch to PostgREST's `or` with the array form, or call `.ilike()` four times in `Promise.all` and union the result IDs server-side. As a quick patch, also `replaceAll(/[(),.]/g, " ")`. Reject queries longer than e.g. 80 chars.

---

### 13. Customer-import diagnostics leak DB error details outside production

- **Description**: `app/api/customers/import/route.ts:65-89` returns `phase`, `traceId`, the full Postgres `message`, `code`, `details`, and `hint` whenever `process.env.NODE_ENV !== "production"`. Vercel preview environments and any environment with a missing or misset `NODE_ENV` (e.g. forgotten `vercel.json` override, custom Docker image) will expose internal column names, constraint names, and table relationships to unauthenticated callers (the route requires auth, but the same pattern is easily copied to the public `/api/enquiries`).
- **Affected Area**: `app/api/customers/import/route.ts:65-89`.
- **Likelihood / Impact / Risk**: Low / Medium / **Low**
- **Effort Estimate**: Low.
- **Cost Implication**: Low.
- **Scope of Fix**: Localised.
- **Recommended Fix**: Gate detailed responses behind an explicit `process.env.IMPORT_DIAGNOSTICS === "1"` opt-in (off by default in preview and production). Continue to log full details server-side with `console.error`.

---

### 14. Mailpit fallback transport uses plaintext SMTP

- **Description**: `lib/email/transport.ts:62-70` falls back to a plaintext nodemailer transport (`secure: false`) to host `127.0.0.1:1025` whenever `RESEND_API_KEY` is unset. If a production deploy forgets to set `RESEND_API_KEY`, all outbound mail — including password-reset notifications, voucher emails containing PII, and invoice attachments — will be attempted in cleartext against the host the container resolves at port 1025.
- **Affected Area**: `lib/email/transport.ts:61-102, 148-164`.
- **Likelihood / Impact / Risk**: Low / Low / **Low**
- **Effort Estimate**: Low.
- **Cost Implication**: Low.
- **Scope of Fix**: Localised.
- **Recommended Fix**: Refuse to fall back to Mailpit when `NODE_ENV === "production"`. Throw a clear startup error if `RESEND_API_KEY` is missing in production.

---

### 15. `CRON_SECRET` compared with non-constant-time `!==`

- **Description**: `app/api/cron/email-sync/route.ts:7` and `app/api/cron/pipeline-auto-close/route.ts:42` use `authHeader !== \`Bearer ${process.env.CRON_SECRET}\`` to validate the bearer header. String comparison short-circuits, in principle leaking secret length and prefix via timing. Real exploitability is very low over TLS / Vercel's edge, but the fix is one line.
- **Affected Area**: `app/api/cron/email-sync/route.ts`, `app/api/cron/pipeline-auto-close/route.ts`.
- **Likelihood / Impact / Risk**: Low / Low / **Low**
- **Effort Estimate**: Low.
- **Cost Implication**: Low.
- **Scope of Fix**: Localised.
- **Recommended Fix**: Replace with `crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(`Bearer ${process.env.CRON_SECRET}`))`, after a length check.

---

## 4. Priority Actions

Tackle the highest-risk, lowest-effort wins first:

1. **Bump `next` to `^16.2.6`** and run `pnpm up --latest` for the other vulnerable transitive deps; add `pnpm.overrides` where parents lag. (Finding 1, 4.)
2. **Tighten RLS policies** on the `biz_*` tables to mirror `lib/role-context.tsx`. (Finding 2.)
3. **Lock down `/api/enquiries`**: add a Zod schema, body-size cap, rate limit, CAPTCHA, and move off the service-role client. (Finding 3.)
4. **Add security response headers** (CSP, HSTS, X-Frame-Options, etc.) in `next.config.mjs`. (Finding 7.)
5. **Sanitise `body_html`** before any `dangerouslySetInnerHTML` render. (Finding 5.)
6. **Disable Supabase signups, raise password floor to 12+, enable captcha.** (Finding 6.)
7. **Strip the hard-coded dev quick-login defaults** and rotate any account still on `password123`. (Finding 8.)
8. **Add rate limiting** to `/api/enquiries`, login, and `/api/users/[userId]/password`. (Finding 9.)

The remaining findings (10–15) are smaller cleanups that should follow once the high-impact items above are closed.
