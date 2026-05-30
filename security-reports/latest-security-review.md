# Security Review — Luxus Sales System

| Field | Value |
|---|---|
| Repository | `hawkcoding/v0-luxu-sales-system` |
| Branch reviewed | `claude/friendly-curie-oPpWb` |
| Run date | 2026-05-30 |
| App version | 3.22 (`lib/version.ts`) |
| Total findings | 12 |
| Overall security posture | **Moderate** |
| Highest-risk issue | Public `POST /api/enquiries` runs under `service_role` with no Zod validation |
| Lowest-risk issue | Cron bearer-token comparison is not constant-time |

> Scope: application code, configuration, dependency surface, Supabase migrations and RLS policies, public API routes, authentication and authorisation flow. No live infrastructure probing was performed.

---

## 1. Summary

- **Total vulnerabilities / issues**: 12 (1 Critical, 4 High, 4 Medium, 3 Low).
- **Highest-risk issue**: *Public enquiry intake bypasses RLS and is unvalidated* (`app/api/enquiries/route.ts`). The endpoint declares it is intentionally public, calls `createServiceClient()` (service-role JWT — bypasses RLS), and accepts arbitrary JSON. The in-file comment claims input is "validated at the Zod boundary above", but **no Zod schema is defined or applied** for the POST handler. An anonymous attacker can write arbitrary `customers`, `bookings`, `booking_suites`, `travellers`, `booking_transport_requests`, `quotes`, `quote_line_items` and `audit_logs` rows.
- **Lowest-risk issue**: Cron handlers compare the bearer token with `!==`, which is not constant-time. Practically infeasible to exploit at this scale, but flagged for completeness.
- **Posture**: Moderate. Authentication for the staff app is well structured (Supabase SSR cookies, role checks against `profiles.clearance_level`, separated `requireUser` / `requireRole` helpers, audit logging). However, the one intentionally public mutating endpoint is dangerously broad, transport-level hardening (security headers, CSRF defence-in-depth, rate limiting) is absent, and several smaller weaknesses around password policy and stored-XSS surface remain.

---

## 2. Risk Matrix

| # | Issue | Likelihood | Impact | Risk |
|---|---|---|---|---|
| 1 | Public `POST /api/enquiries` uses service-role client with no Zod validation | High | High | **Critical** |
| 2 | No rate limiting on any API route (login, public enquiries, password reset) | High | Medium | **High** |
| 3 | Hard-coded dev quick-login credentials shipped in the client bundle for known production-format addresses | Medium | High | **High** |
| 4 | No security HTTP headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) | High | Medium | **High** |
| 5 | Weak minimum password length (≥6) for both user creation and admin password reset | High | Medium | **High** |
| 6 | Stored-XSS surface via `dangerouslySetInnerHTML` on template preview | Medium | Medium | **Medium** |
| 7 | No CSRF defence-in-depth on cookie-authenticated mutating endpoints | Medium | Medium | **Medium** |
| 8 | `GET /api/data` does not fail-closed on missing session (relies entirely on RLS) | Low | Medium | **Medium** |
| 9 | Email credential encryption derives AES key with a single SHA-256 of secret (no KDF) | Low | Medium | **Medium** |
| 10 | Production and development Supabase project refs leaked in `.env.sync.local.example` | Medium | Low | **Low** |
| 11 | Verbose error diagnostics returned when `NODE_ENV !== "production"` (DB hints/codes/details) | Low | Low | **Low** |
| 12 | Cron auth uses non-constant-time bearer-token comparison | Low | Low | **Low** |

---

## 3. Detailed Findings

### 1. Public `POST /api/enquiries` uses service-role client with no Zod validation — **Critical**

- **Affected area**: `app/api/enquiries/route.ts` (POST handler, lines 410–704).
- **Description**: The handler comments confirm the route is intentionally public ("this route is public (web form & paste import) so there is no authenticated user session to rely on", line 412–414) and switches to `createServiceClient()` (service_role JWT — bypasses RLS). The traveller insert block carries a comment that input is "validated at the Zod boundary above" (line 572), but **no Zod schema is defined for the request body anywhere in the file**. Fields such as `body.travellers`, `body.transportRequests`, `body.extractedJson`, `body.linkedCustomerId`, `body.supplierId`, `body.routeId`, `body.packageOption`, `body.contactNumber`, `body.rawText` are consumed as `unknown` and inserted directly into the database. The endpoint inserts into `customers`, `bookings`, `booking_suites`, `travellers`, `booking_transport_requests`, `booking_vehicle_rental_details`, `quotes`, `quote_line_items` and `audit_logs`. Combined with the bypass of RLS, an anonymous attacker can:
  - Mass-create or overwrite customer records (PII pollution, GDPR exposure).
  - Insert spam/abuse bookings that pollute the pipeline and consume job numbers.
  - Forge audit log entries (line 664) attributing actions to arbitrary actor strings.
  - Hijack a known customer by passing `linkedCustomerId` and overwriting their `phone`, `country`, `title`, `first_name`, `last_name` (line 757–767 in `resolveEnquiryCustomer`).
  - Pre-populate quotes/line items at scale, triggering downstream cost (Resend, PDF generation).
- **Likelihood**: High — endpoint is unauthenticated and reachable from the internet.
- **Impact**: High — data integrity loss, PII exposure, billing exposure (Resend), reputational damage.
- **Effort**: Medium — define a strict Zod schema for the request body, validate before any DB write, and prefer `createSessionClient()` whenever a salesperson session is available. Add per-IP rate limiting and a CAPTCHA / hCaptcha / Cloudflare Turnstile token check for fully anonymous submissions, and treat anonymous submissions as "needs review" with hard server-side limits on travellers/transport rows.
- **Cost**: Medium.
- **Scope of fix**: Cross-cutting — affects the public form, the paste-import flow, downstream auditing, and the quote auto-creation path.
- **Recommended fix**:
  1. Add a Zod schema in the file that covers every field touched (including arrays: `travellers`, `childTravellers`, `transportRequests`, `extractedJson`, `suiteSelections`/`suiteTypes`).
  2. Reject the request body before any `supabase` call if validation fails — return `400` with `flattenZod(...)`.
  3. Use the existing `createSessionClient()` when a logged-in salesperson is making the call; only fall back to `createServiceClient()` for truly anonymous submissions. Even then, scope the service-role inserts to a minimal subset (no audit-log writes attributed to arbitrary actor strings — set `actor` to `"public_form"`/`"paste_import"` server-side, never from the body).
  4. Cap array sizes (e.g. `travellers.max(20)`, `transportRequests.max(10)`).
  5. Add a per-IP rate limit (e.g. Upstash Ratelimit or Vercel KV) for anonymous POSTs, and gate fully anonymous submissions with a Turnstile/hCaptcha token verified server-side.
  6. Reject `linkedCustomerId` for anonymous (unauthenticated) callers — only allow it when there is a valid session.

---

### 2. No rate limiting on any API route — **High**

- **Affected area**: All of `app/api/**` and `app/login/page.tsx`.
- **Description**: `grep -rn 'rate.limit\|ratelimit\|throttle' lib/ app/` returns no results. The Supabase `signInWithPassword` call on login has no server-side throttle in front of it, the public `POST /api/enquiries` has none, and password-reset (`requestPasswordReset` in `lib/auth-context.tsx`) is similarly unmetered. Combined with finding #5 (6-char passwords), credential brute-forcing is plausible.
- **Likelihood**: High.
- **Impact**: Medium — account takeover, spam, infrastructure cost.
- **Effort**: Low — drop in `@upstash/ratelimit` + `@vercel/kv` (or Vercel's first-party rate limit) and apply at minimum to `/api/enquiries`, `/login`-driven flows, `/api/users/[userId]/password`, and the `/auth/callback` exchange.
- **Cost**: Low (Upstash free tier covers typical workload).
- **Scope of fix**: Cross-cutting (helper + per-route adoption).
- **Recommended fix**: Add a shared `withRateLimit(key, limit)` wrapper in `lib/api/` and apply to: public POSTs, login, password-reset, password-set, voucher generation (cost-heavy), and document upload.

---

### 3. Hard-coded dev quick-login credentials in the client bundle — **High**

- **Affected area**: `app/login/page.tsx:14–100`.
- **Description**: The file inlines five production-style email addresses (`carmen@luxustravel.co.za`, `dirk@…`, `leonie@…`, `monade@…`, `douwlien@…`) and a default password `"password123"` under a `process.env.NODE_ENV === "development"` gate. While Next.js will inline `process.env.NODE_ENV` and dead-code-eliminate the gate in a real production build, the risk surface is:
  - Anyone with read access to the public GitHub repo learns the exact email naming convention and a known default password (which may match seeded dev/staging users that are reachable via dev/preview deployments).
  - Vercel preview deployments built with `NODE_ENV=development` (or local builds that get exposed) will ship a working brute-force button.
  - If the same passwords are ever re-used in staging or initial production seeding, this is an immediate credential exposure.
- **Likelihood**: Medium (depends on deployment hygiene and whether seeded credentials were rotated).
- **Impact**: High if exploited (full salesperson/manager/admin account takeover).
- **Effort**: Low — delete the hard-coded defaults and require both email and password to be supplied via `localStorage`/env, or remove the quick-login altogether.
- **Cost**: Low.
- **Scope of fix**: Localised.
- **Recommended fix**:
  1. Remove the literal email list and `defaultDevQuickLoginPasswords` constant.
  2. Require both `devQuickLoginEmail` and `devQuickLoginPasswords` to come from `NEXT_PUBLIC_DEV_QUICK_LOGIN_*` env vars (never compiled into the public bundle as defaults) or `localStorage`.
  3. Confirm via grep that any seed data using `password123` has been rotated in every Supabase environment.

---

### 4. No security HTTP headers — **High**

- **Affected area**: `next.config.mjs`, `vercel.json`.
- **Description**: Neither file defines a `headers()` block. There is no Content-Security-Policy, HSTS, X-Frame-Options/`frame-ancestors`, X-Content-Type-Options, Referrer-Policy or Permissions-Policy. Click-jacking, MIME-sniffing, and downgrade attacks are not mitigated at the edge. The app renders untrusted HTML in `app/app/templates/page.tsx:185` (see #6), which a strict CSP would constrain.
- **Likelihood**: High (attack opportunity always present).
- **Impact**: Medium (depends on chained finding).
- **Effort**: Low — add a `headers()` block in `next.config.mjs`.
- **Cost**: Low.
- **Scope of fix**: Localised.
- **Recommended fix**: In `next.config.mjs`, return:
  ```js
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "X-Content-Type-Options",   value: "nosniff" },
        { key: "X-Frame-Options",          value: "DENY" },
        { key: "Referrer-Policy",          value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy",       value: "camera=(), microphone=(), geolocation=()" },
        { key: "Content-Security-Policy",  value: "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com; connect-src 'self' https://*.supabase.co; frame-ancestors 'none';" },
      ],
    }]
  }
  ```
  Iterate the CSP using browser console reports — Vercel Analytics needs `https://va.vercel-scripts.com`; Supabase needs `https://*.supabase.co`.

---

### 5. Weak minimum password length (≥6) — **High**

- **Affected area**: `app/api/users/route.ts:20` (`password: z.string().min(6, ...)`), `app/api/users/[userId]/password/route.ts:59` (`if (!newPassword || newPassword.length < 6)`).
- **Description**: Both the admin user-creation endpoint and the admin password-reset endpoint accept passwords as short as 6 characters. Modern guidance (NIST SP 800-63B Rev. 4, OWASP ASVS L1) is a minimum of 8 characters, ideally 12+ with no maximum, and a check against a known-breached list.
- **Likelihood**: High (admins routinely default to short passwords when permitted).
- **Impact**: Medium (compromised salesperson/manager account).
- **Effort**: Low — bump the minimum to 12 and (optionally) add an HIBP `k`-anonymity check.
- **Cost**: Low.
- **Scope of fix**: Localised (two endpoints + UI hint text).
- **Recommended fix**: Update both files to `.min(12, "Password must be at least 12 characters")` and surface a clear message on the admin UI.

---

### 6. Stored-XSS surface via `dangerouslySetInnerHTML` on template preview — **Medium**

- **Affected area**: `app/app/templates/page.tsx:185` (`<div … dangerouslySetInnerHTML={{ __html: preview?.bodyHtml || "" }} />`).
- **Description**: The template-editor preview renders the stored template `bodyHtml` directly into the DOM. Templates can be edited by manager/admin via `/api/templates`. A malicious or compromised manager (or an attacker who reaches the templates table via finding #1) can inject `<script>`/`<img onerror>` payloads that fire when any other staff member previews the template, hijacking their authenticated session.
- **Likelihood**: Medium (insider / chained with #1).
- **Impact**: Medium (full session compromise of any admin/manager/consultant who opens the preview).
- **Effort**: Low — sanitise with DOMPurify before rendering, or render inside a sandboxed `<iframe sandbox="allow-same-origin">`.
- **Cost**: Low.
- **Scope of fix**: Localised.
- **Recommended fix**:
  1. Add `isomorphic-dompurify` (or `dompurify` with a JSDOM polyfill) and call `DOMPurify.sanitize(bodyHtml, { USE_PROFILES: { html: true } })` before passing to `dangerouslySetInnerHTML`.
  2. Strengthen the CSP from #4 (`script-src 'self'`) so even a successful injection cannot execute inline scripts.
  3. Validate template bodies on write inside `/api/templates` against an allowlist of safe tags.

---

### 7. No CSRF defence-in-depth on cookie-authenticated mutations — **Medium**

- **Affected area**: All cookie-authenticated POST/PUT/DELETE handlers under `app/api/**`.
- **Description**: Authentication uses Supabase SSR cookies. Supabase's default cookies are `SameSite=Lax`, which protects against most cross-site form POSTs, but `Lax` does not block top-level navigations and does nothing for same-site sub-domain attacks. There is no additional CSRF token, no `Origin`/`Referer` validation in API handlers, and no explicit `SameSite=Strict` enforcement.
- **Likelihood**: Low–Medium.
- **Impact**: Medium (state-changing actions executed under the victim's session).
- **Effort**: Low — verify `Origin`/`Referer` matches `request.nextUrl.origin` inside a shared `requireUser` helper, and return 403 on mismatch.
- **Cost**: Low.
- **Scope of fix**: Cross-cutting (add a single check in `lib/api/auth.ts`).
- **Recommended fix**: Inside `requireUser` (or a new wrapper), reject any non-`GET` request whose `Origin` (or `Referer` when `Origin` is null) does not match the expected app origin.

---

### 8. `GET /api/data` does not fail-closed on missing session — **Medium**

- **Affected area**: `app/api/data/route.ts`.
- **Description**: The handler calls `supabase.auth.getUser()` but does not return `401` when `user` is null — instead it continues and lets RLS filter rows. RLS is correctly configured today, but the route should fail-closed so that a future RLS regression (e.g. a `USING (true)` policy added to a table — there are already 93 such policies across `supabase/migrations/`, mostly correctly scoped `TO authenticated` but easy to widen accidentally) does not silently expose data to anonymous callers.
- **Likelihood**: Low.
- **Impact**: Medium (bulk data exposure if RLS regresses).
- **Effort**: Low.
- **Cost**: Low.
- **Scope of fix**: Localised.
- **Recommended fix**: Replace the inline `getUser()` block with `const auth = await requireUser(); if (!auth.ok) return auth.response;` and use `auth.value.supabase` thereafter.

---

### 9. Email credential AES key is derived with a single SHA-256 — **Medium**

- **Affected area**: `lib/inbound-email/crypto.ts:6–14`.
- **Description**: `getCredentialKey()` returns `sha256(secret)` as the AES-256-GCM key. SHA-256 is not a KDF — if `EMAIL_CREDENTIAL_ENCRYPTION_KEY` is ever set to a low-entropy value (e.g. a human-typed phrase), an attacker who exfiltrates the IMAP credentials table can brute-force it cheaply on a GPU. Also missing: no key rotation indicator beyond the hard-coded `"v1"` version tag — rotating the key requires manual re-encryption logic that doesn't exist.
- **Likelihood**: Low (depends on operator key hygiene).
- **Impact**: Medium (IMAP credentials → access to mailboxes containing customer/supplier correspondence).
- **Effort**: Medium (changes encoding format; needs migration of existing rows).
- **Cost**: Low.
- **Scope of fix**: Localised, but requires a back-fill migration if existing rows are encrypted under the old key.
- **Recommended fix**:
  1. Either enforce `EMAIL_CREDENTIAL_ENCRYPTION_KEY` to be a 32-byte base64 value (validate at boot) and use it directly, or derive with `scrypt`/`argon2id` using a stored per-row salt.
  2. Add a key-version field and a re-encryption routine to allow rotation.

---

### 10. Supabase project refs leaked in `.env.sync.local.example` — **Low**

- **Affected area**: `.env.sync.local.example:11,13`.
- **Description**: The example file contains the real dev (`isxpuhttwzyvjclrnhbg`) and prod (`qlwldfhjfbxliyjvoziu`) Supabase project refs in a comment. This identifies the specific Supabase projects, exposing them to focussed brute-force / credential-stuffing if any other secret leaks. Project refs alone are not credentials, but reduce attacker uncertainty.
- **Likelihood**: Medium (repo is on GitHub).
- **Impact**: Low (not a credential by itself).
- **Effort**: Low — replace with placeholders.
- **Cost**: Low.
- **Scope of fix**: Localised.
- **Recommended fix**: Replace with `<dev-project-ref>` / `<prod-project-ref>` placeholders, as the rest of the file already does, and rotate the project DB password if it has ever been pasted into the file historically.

---

### 11. Verbose error diagnostics outside production — **Low**

- **Affected area**: `app/api/customers/import/route.ts:66–89`.
- **Description**: When `NODE_ENV !== "production"` the response body includes `phase`, `traceId`, and `details` (DB code, hint, internal error message). Acceptable in development, but if a preview/staging build ever runs with `NODE_ENV=development`, an attacker can use this for reconnaissance against the schema.
- **Likelihood**: Low (depends on environment configuration discipline).
- **Impact**: Low (information disclosure).
- **Effort**: Low.
- **Cost**: Low.
- **Scope of fix**: Localised.
- **Recommended fix**: Gate diagnostics on an explicit `process.env.IMPORT_VERBOSE_DIAGNOSTICS === "true"` flag rather than `NODE_ENV`, and ensure Vercel preview builds run with `NODE_ENV=production`.

---

### 12. Cron handlers use non-constant-time bearer-token comparison — **Low**

- **Affected area**: `app/api/cron/backup/route.ts:10`, `app/api/cron/email-sync/route.ts:7`, `app/api/cron/pipeline-auto-close/route.ts:42`, `app/api/cron/payment-reminders/route.ts:8`, `app/api/cron/quote-follow-ups/route.ts:8`.
- **Description**: Each handler does `authHeader !== \`Bearer ${process.env.CRON_SECRET}\``. JavaScript's `!==` short-circuits per-character; over the public internet this is essentially unexploitable, but the constant-time pattern is trivially safer and is the documented best practice.
- **Likelihood**: Low.
- **Impact**: Low.
- **Effort**: Low.
- **Cost**: Low.
- **Scope of fix**: Localised (single shared helper across 5 routes).
- **Recommended fix**: Extract a `verifyCronAuth(request)` helper that uses `crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))` with equal-length buffers (compare hashes, not raw tokens, if lengths differ).

---

## 4. Priority Actions

Address in this order — biggest risk-reduction per unit of work first.

1. **Fix the public enquiry endpoint (#1)** — single most important change. Define a Zod schema, cap array sizes, reject `linkedCustomerId` for anonymous callers, prefer `createSessionClient()` when a session exists, and gate fully-anonymous submissions behind Turnstile + rate limiting.
2. **Add rate limiting (#2)** — start with `/api/enquiries`, the login flow, `/api/users/[userId]/password` and `/auth/callback`. Pairs with #1 to neutralise abuse.
3. **Remove hard-coded dev credentials from the client bundle (#3)** — five-minute edit; immediate risk reduction.
4. **Add security headers in `next.config.mjs` (#4)** — single-file change, broad benefit, and a prerequisite for hardening #6.
5. **Raise minimum password length to 12 (#5)** — two-line change across two files.
6. **Sanitise template preview HTML (#6)** — add `isomorphic-dompurify` and wrap the one render.
7. **Add `Origin`/`Referer` check in `requireUser` (#7)** — defence-in-depth for cookie-authenticated mutations.
8. **Make `/api/data` fail-closed on missing session (#8)** — small change, removes one regression-class exposure.
9. **Harden `EMAIL_CREDENTIAL_ENCRYPTION_KEY` handling (#9)** — schedule once mailbox encryption is fleshed out; requires a back-fill plan.
10. **Scrub project refs from `.env.sync.local.example` (#10)** and confirm the example template is `<prod-project-ref>`-only.
11. **Tighten diagnostics gating in customer import (#11)**.
12. **Switch cron auth to `timingSafeEqual` (#12)** — fold into the rate-limit helper PR.

---

*No live secrets, tokens, or `.env.local` values were found in the repository.* The codebase already follows several best practices: server-side role gating with `requireRole`, audit-log writes on sensitive actions, encrypted IMAP credentials, idempotent migrations, RLS enabled across all multi-tenant tables, and explicit confirmation on destructive backup-restore. The findings above are concrete, actionable improvements rather than a sign of systemic neglect.
