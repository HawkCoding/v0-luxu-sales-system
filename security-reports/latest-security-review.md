# Security Review — Luxus Sales System

| Field | Value |
| --- | --- |
| Repository | `HawkCoding/v0-luxu-sales-system` |
| Run date | 2026-06-09 |
| Branch reviewed | `claude/friendly-curie-taef68` |
| App version | `3.22` (`lib/version.ts`) |
| Total findings | 17 |
| Overall security posture | **Poor** |
| Highest-risk issue | Public `POST /api/enquiries` endpoint bypasses RLS, accepts unvalidated input from the open internet |
| Lowest-risk issue | `uuid` v10 bounds-check CVE inside a transitive `resend → svix` dependency (unreachable code path) |

> The combination of (a) a public service-role write endpoint with no schema validation, (b) multiple unpatched **High** Next.js CVEs that can defeat middleware authorization, and (c) blanket `USING (true)` RLS policies on the core business tables leaves the application exposed to bulk data injection, unauthorized data exfiltration, and credential-level privilege escalation. Several of these issues should be treated as drop-everything-and-fix before the next push to production.

---

## 1. Summary

- **Total vulnerabilities:** 17 application/configuration findings + 32 dependency advisories (1 critical, 12 high, 16 moderate, 3 low) reported by `pnpm audit`.
- **Highest-risk issue:** *Public POST `/api/enquiries` uses the service-role client without authentication or Zod validation* — an attacker can flood the production DB with arbitrary customer/booking rows, inject any `extracted_json` blob, and trigger expensive downstream work (job-number allocation, quote build, audit writes) without auth, captcha, or rate limit.
- **Lowest-risk issue:** *`uuid` < 11.1.1 bounds-check CVE* — present only via `resend → svix → uuid`, in a code path (`v3/v5/v6` with a caller-provided buffer) the app does not exercise.
- **Overall security posture:** **Poor.** The auth, validation, and dependency-hygiene gaps are all individually exploitable; the public ingest route plus the unpatched Next.js middleware-bypass CVEs are a particularly dangerous combination.

---

## 2. Risk Matrix

| # | Issue | Likelihood | Impact | Risk Level |
| --- | --- | --- | --- | --- |
| 1 | Public `POST /api/enquiries` uses service-role client, no auth, no Zod validation | High | High | **Critical** |
| 2 | Multiple unpatched High-severity Next.js CVEs (16.1.6 → 16.2.5+) | High | High | **Critical** |
| 3 | Permissive RLS policies (`USING (true) WITH CHECK (true)`) on core tables | Medium | High | **High** |
| 4 | Public Supabase signup enabled (`auth.enable_signup = true`) on internal-only app | High | Medium | **High** |
| 5 | Vitest 4.0.18 critical CVE — arbitrary file read/exec via UI server | Low | High | **High** |
| 6 | Weak password policy: `minimum_password_length = 6`, no complexity, no MFA | High | Medium | **High** |
| 7 | No application-layer rate limiting on any API route | Medium | Medium | **Medium** |
| 8 | Public voucher-asset bucket accepts SVG uploads (stored XSS via SVG) | Low | Medium | **Medium** |
| 9 | `dangerouslySetInnerHTML` renders DB-stored email templates unsanitized | Low | Medium | **Medium** |
| 10 | CSV formula injection in `lib/reports/to-csv.ts` | Medium | Low | **Medium** |
| 11 | Timing-unsafe Bearer-token comparison for `/api/cron/*` | Low | Medium | **Medium** |
| 12 | PostgREST `.or()` filter escape misses `(`, `)`, `"` in customer search | Low | Medium | **Medium** |
| 13 | `GET /api/jobs/[id]` and `GET /api/data` perform no auth check at the API layer | Low | Medium | **Medium** |
| 14 | No security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options) configured | Medium | Low | **Low–Medium** |
| 15 | Local dev-quick-login wired into production bundle (gated only by `NODE_ENV`) | Low | Medium | **Low–Medium** |
| 16 | `ws` < 8.20.1 uninitialized-memory disclosure (via `@supabase/realtime-js`) | Low | Low | **Low** |
| 17 | `uuid` < 11.1.1 missing buffer bounds check (via `resend → svix`) | Low | Low | **Low** |

---

## 3. Detailed Findings

### 1. Public `POST /api/enquiries` uses service-role client, no auth, no Zod validation — **Critical**

- **Description:** `app/api/enquiries/route.ts:410` exposes a public POST handler that calls `createServiceClient()` (RLS bypass) and reads `body` directly with no Zod schema. The handler inserts into `customers`, `bookings`, `booking_suites`, `travellers`, `booking_transport_requests`, `booking_vehicle_rental_details`, `quotes`, `quote_line_items`, and `audit_logs`, and triggers package-pricing lookups and job-number allocation per request. The comment on line 412 explicitly notes "this route is public … there is no authenticated user session." There is no captcha, no rate limit, and no body shape validation.
- **Affected area:** `app/api/enquiries/route.ts` (POST), every table the handler writes to, the public web intake form.
- **Likelihood / Impact / Risk:** High / High / **Critical**. Any unauthenticated user on the internet can:
  - Flood the production database with arbitrary `customers` and `bookings`.
  - Set `is_repeat_client_at_creation`, `terms_accepted`, `additional_services_details`, etc. to attacker-controlled values.
  - Inject malicious payloads into `extracted_json` (a `Json` column later rendered in the dashboard).
  - Trigger expensive server work (rate-card lookups, quote builds) per request.
  - Pollute audit logs (`actor` defaults to `"system"` or `"consultant"` for unauthenticated callers).
- **Effort estimate:** Medium. Add a Zod schema for the full body, throttle by IP, optionally add a turnstile/hCaptcha challenge.
- **Cost implication:** Low–Medium (engineering time + captcha vendor).
- **Scope of fix:** Localised to the route and the public form's submit handler.
- **Recommended fix:**
  1. Define a strict `enquirySchema` (zod) covering every property used below — strings with `max()`, enum'd `source`, numeric guards on `noOfAdults/Children/Suites/extraNights`. Reject unknown keys (`.strict()`).
  2. Add IP-based rate limiting (Vercel Edge KV, Upstash, or `@upstash/ratelimit`) — e.g. 10 enquiries/IP/hour.
  3. Add Cloudflare Turnstile or hCaptcha — already supported by Supabase via `[auth.captcha]`.
  4. Cap the size of `rawText`/`extractedJson` (e.g. 32 KB) so the JSON column cannot be abused for storage.
  5. Consider moving the public ingest behind a dedicated Edge Function with stricter auth (signed-URL or one-time-token) rather than a service-role client.

### 2. Multiple unpatched High-severity Next.js CVEs — **Critical**

- **Description:** `pnpm audit` reports `next@16.1.6` is vulnerable to several CVEs fixed in `16.1.7` and `16.2.5`. The most serious for this codebase:
  - **CVE-2026-44574** (GHSA-492v-c6pp-mqqv, CVSS 8.1 High) — Middleware/proxy bypass via dynamic route parameter injection.
  - **CVE-2026-44575** (GHSA-267c-6grr-h53f, CVSS 7.5 High) — Middleware bypass via segment-prefetch routes (`.rsc` variants).
  - **CVE-2026-29057** — HTTP request smuggling in rewrites.
  - **CVE-2026-27978** — `Origin: null` CSRF bypass for Server Actions.
  - SSRF advisory (CVSS 8.6) and PPR DoS advisory also present.
- **Affected area:** Every route protected by `proxy.ts` (the middleware) — i.e. every `/app/*` page, redirect, and authentication enforcement. CSRF advisory affects any Server Action.
- **Likelihood / Impact / Risk:** High / High / **Critical**. The repo's `proxy.ts` does no authorization on its own — it just refreshes tokens — so the practical blast radius is smaller than an app that relies on middleware for auth. However, the request-smuggling and CSRF advisories still apply.
- **Effort estimate:** Low. Bump `next` to `^16.2.5`.
- **Cost implication:** Low.
- **Scope of fix:** Localised (single dependency bump + smoke test).
- **Recommended fix:** `pnpm up next@^16.2.5` then verify `pnpm build`, `pnpm test:ci`, and `pnpm qa` still pass. Re-run `pnpm audit` to confirm 0 high/critical for `next`.

### 3. Permissive RLS policies on core tables — **High**

- **Description:** `supabase/migrations/20260308095136_remote_schema.sql:1168–1340` creates RLS policies of the form `FOR <op> TO "authenticated" USING (true) WITH CHECK (true)` on `audit_logs`, `booking_suites`, `bookings`, `correspondences`, `customers`, `documents`, `itineraries`, `payments`, `quote_line_items`, `quotes`, and `travellers`. Role-based authorization (admin/manager/consultant) is enforced only at the API layer (e.g. `lib/api/auth.ts:requireRole`).
- **Affected area:** Every business table; all API routes; future routes added by other contributors.
- **Likelihood / Impact / Risk:** Medium / High / **High**. Any future route that forgets to call `requireRole` (or uses `createSessionClient` without checking `auth.getUser()`) automatically inherits read/write of every customer, booking, payment, and audit log for any authenticated user. The pattern is brittle by design — defense-in-depth at the DB layer is essentially absent.
- **Effort estimate:** High. Implement role-aware RLS using `auth.jwt()->>'clearance_level'` (already wired through `auth.hook.custom_access_token`) so policies enforce admin/manager/consultant restrictions in PostgREST itself.
- **Cost implication:** Medium.
- **Scope of fix:** Cross-cutting (every business table) but a one-time migration.
- **Recommended fix:** Add a `current_role()` SQL helper that returns the JWT claim and replace `USING (true)` with `USING (current_role() IN ('admin','manager','consultant','readonly'))` (and tighter conditions on write). For sensitive tables (e.g. `payments`, `audit_logs`) limit `SELECT` to the booking owner or admin/manager.

### 4. Public Supabase signup enabled — **High**

- **Description:** `supabase/config.toml:184` sets `enable_signup = true` and `auth.email:enable_signup = true` for this internal sales system. Any anonymous visitor can create a Supabase Auth account against the project. Because every business-table RLS policy is keyed to `authenticated` (see finding #3), a self-signup gives the attacker read access to all customer/booking/payment data the moment they call `/api/data`.
- **Affected area:** Supabase auth project, every RLS-protected table.
- **Likelihood / Impact / Risk:** High / Medium / **High**. Mitigation: `app/app/layout.tsx` checks `profiles.clearance_level` before granting UI access, but RLS does not — direct PostgREST calls (or any API route that does not check role) succeed for the self-registered user.
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Set `[auth] enable_signup = false` and `[auth.email] enable_signup = false`, deploy via Supabase Studio, and re-apply on every `supabase db push`. Confirm `auth.hook.before_user_created` is unnecessary or wire one to enforce an allow-list domain.

### 5. Vitest 4.0.18 critical CVE — arbitrary file read/exec via UI server — **High**

- **Description:** `pnpm audit` flags `vitest@4.0.18` (GHSA-5xrq-8626-4rwp, **CVSS 9.8 Critical**, CVE-2026-47429). The Vitest UI server is vulnerable to arbitrary file read on Windows and arbitrary script execution (via `saveTestFile` + `rerun`) when exposed to the network.
- **Affected area:** Local developer workstations; CI runners that expose the Vitest UI.
- **Likelihood / Impact / Risk:** Low / High / **High**. The app uses `pnpm test`/`pnpm test:ci` which run headless — Vitest UI is not used in CI (`ci.yml` runs `pnpm test:ci`). However, any developer who runs `pnpm vitest --ui --api.host 0.0.0.0` is exposed.
- **Effort estimate:** Low. Upgrade dev dependency.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** `pnpm up -D vitest@^4.1.0 @vitest/coverage-v8@^4.1.0` and re-run the test suite.

### 6. Weak password policy & no MFA — **High**

- **Description:** `supabase/config.toml` sets `minimum_password_length = 6` and `password_requirements = ""` (line 189–193) and disables MFA (`auth.mfa.totp.enroll_enabled = false`, line 301). The admin password reset endpoint also accepts any string `>= 6 chars` (`app/api/users/[userId]/password/route.ts:59`). The user-create endpoint enforces the same minimum (`app/api/users/route.ts:20`).
- **Affected area:** All staff logins; admin account compromise → full DB takeover (admin can restore backups, delete users, etc.).
- **Likelihood / Impact / Risk:** High / Medium / **High** for staff accounts; **Critical** if an admin account uses a 6-char password.
- **Effort estimate:** Low.
- **Cost implication:** Low (engineering); medium UX (password reset for existing staff).
- **Scope of fix:** Localised (config + 2 API routes).
- **Recommended fix:** Set `minimum_password_length = 12` and `password_requirements = "lower_upper_letters_digits"`; bump the API schemas to match. Enable TOTP MFA (`enroll_enabled = true`, `verify_enabled = true`) and require it for `admin`/`manager` roles in the login flow.

### 7. No application-layer rate limiting — **Medium**

- **Description:** A repo-wide grep for `rateLimit|throttle` returns no matches. Supabase Auth has a built-in `sign_in_sign_ups = 30 / 5 min / IP` limit, but all other endpoints (`/api/enquiries`, `/api/customers/import`, `/api/correspondence`, `/api/voucher/generate`, etc.) have none.
- **Affected area:** Every API route; particularly damaging on `/api/enquiries` (finding #1), `/api/correspondence` (sends real emails), and `/api/voucher/generate` (expensive PDF rendering).
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**. Email-sending routes could be abused to send mass mail in the company's name; PDF/voucher routes could be used for DoS.
- **Effort estimate:** Medium. Introduce a thin rate-limit middleware (e.g. `@upstash/ratelimit` with Vercel KV).
- **Cost implication:** Low (Upstash free tier is sufficient initially).
- **Scope of fix:** Cross-cutting — best implemented as a wrapper used by all `requireUser`/`requireRole` callers.
- **Recommended fix:** Wrap `requireUser`/`requireRole` with a `withRateLimit({ key, limit, window })` helper; apply per-route caps (e.g. 30/min on writes, 10/min on email sends, 5/min on PDF generation).

### 8. Public voucher-asset bucket accepts SVG uploads — **Medium**

- **Description:** `supabase/config.toml:121-124` configures `storage.buckets.voucher-assets` with `public = true` and `allowed_mime_types = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"]`. The upload route (`app/api/voucher-template/upload/route.ts:29`) lets admins upload SVG directly (`DIRECT_UPLOAD_MIME = "image/svg+xml"`). The resulting URL is rendered as `<img>` in the voucher emails and PDFs — but anyone with the URL also gets the raw file, which can contain `<script>` tags. If served with `Content-Type: image/svg+xml`, browsers will execute embedded JS when the URL is opened directly.
- **Affected area:** `voucher-assets` bucket; voucher emails; anyone who clicks a direct asset URL.
- **Likelihood / Impact / Risk:** Low / Medium / **Medium**. Only admins can upload, but `voucher-template` URLs are sent to customers and indexed by analytics tools — stored XSS payloads could exfiltrate the recipient's cookies if they visit the SVG URL while logged in to the staff app from the same browser.
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised (config + one file).
- **Recommended fix:** Either (a) drop `"image/svg+xml"` from the bucket allow-list and reject SVG in `isAllowedVoucherAsset`, or (b) sanitise uploaded SVGs server-side (e.g. `DOMPurify` server build) before storage. Bonus: serve the bucket with `Content-Disposition: attachment` or behind a signed-URL flow with a non-SVG `Content-Type` rewrite.

### 9. `dangerouslySetInnerHTML` for email-template preview — **Medium**

- **Description:** `app/app/templates/page.tsx:185` renders `preview?.bodyHtml` via `dangerouslySetInnerHTML` with no sanitization. The HTML is sourced from the `templates` table (writable by admins and managers via `/api/templates`).
- **Affected area:** Templates preview UI, any user who opens the preview dialog after a malicious template is saved.
- **Likelihood / Impact / Risk:** Low / Medium / **Medium**. Requires an admin/manager account to plant the payload, but persistent XSS in the staff dashboard would have full session access (session cookies + ability to call any API route).
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Run `bodyHtml` through DOMPurify in the browser before rendering, or render the preview in a sandboxed `<iframe sandbox="allow-same-origin">` with the HTML as the iframe document. Add a server-side guard in `/api/templates` POST/PATCH that strips `<script>`, event handlers, and `javascript:` URLs.

### 10. CSV formula injection in `lib/reports/to-csv.ts` — **Medium**

- **Description:** `lib/reports/to-csv.ts` builds CSV cells as `"<value>"` with only quote-escaping. Excel and Google Sheets evaluate any cell starting with `=`, `+`, `-`, `@`, `\t`, or `\r` as a formula, even if it is wrapped in quotes. Report exports include user-controllable fields (consultant names, customer names via `outstandingPayments`, etc.) and are downloaded by managers (`app/api/reports/[report]/export/route.ts:174`).
- **Affected area:** All CSV exports.
- **Likelihood / Impact / Risk:** Medium / Low / **Medium**. An attacker who can create a customer or supplier with name `=HYPERLINK("http://evil/", "Open me")` (or `=cmd|' /C calc'!A0`) can phish or exploit the manager who opens the export.
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** In `csvCell`, prefix any value whose first character is in `=+-@\t\r` with a single quote (`'`) before quoting. Example:
  ```ts
  const dangerous = /^[=+\-@\t\r]/
  function csvCell(value: unknown): string {
    let text = value === null || value === undefined ? "" : String(value)
    if (dangerous.test(text)) text = "'" + text
    return `"${text.replace(/"/g, '""')}"`
  }
  ```

### 11. Timing-unsafe Bearer-token comparison for `/api/cron/*` — **Medium**

- **Description:** Five cron routes guard themselves with `authHeader !== \`Bearer ${process.env.CRON_SECRET}\`` (`app/api/cron/backup/route.ts:10`, `app/api/cron/email-sync/route.ts:7`, `app/api/cron/payment-reminders/route.ts:8`, `app/api/cron/pipeline-auto-close/route.ts:42`, `app/api/cron/quote-follow-ups/route.ts:8`). String `!==` is not timing-safe.
- **Affected area:** All cron endpoints. Endpoints can trigger DB backups, send payment-reminder emails, auto-close bookings, and sync inbound email.
- **Likelihood / Impact / Risk:** Low / Medium / **Medium**. Network jitter masks most signal, but the principle is wrong and the impact of a leaked secret is significant (mass email send → reputational damage).
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Cross-cutting (extract a small helper, replace five call sites).
- **Recommended fix:** Use `crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))` (with a constant-time length check first). Move the check into a shared `requireCronSecret(req)` helper.

### 12. PostgREST `.or()` filter escape misses `(`, `)`, `"` — **Medium**

- **Description:** `app/api/customers/route.ts:44–48` builds an `.or()` filter by escaping `,`, `%`, `_` only. PostgREST `.or()` uses `(`, `)` to denote nested logical groups and `"` to denote literal-quoted values, so the escape is incomplete and a malicious `search=` value can inject additional filter conditions.
- **Affected area:** `/api/customers?search=` (used by the customer-search picker for authenticated staff).
- **Likelihood / Impact / Risk:** Low / Medium / **Medium**. Practical exploitation requires an authenticated user; the worst-case is filter widening (`)or(id.eq.…)`) to enumerate customers an attacker should not see.
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Escape the additional metacharacters or, better, build the filter via the JS query builder using `.ilike()` chained calls inside a `.or()` — or rewrite using `to_tsvector`-based search. Add a length cap (`query.slice(0, 80)`) for defense in depth.

### 13. `GET /api/jobs/[id]` and `GET /api/data` perform no auth check — **Medium**

- **Description:** `app/api/jobs/[id]/route.ts:85–95` (GET) and `app/api/data/route.ts:28–43` (GET) call `createSessionClient()` but do not return 401 if `auth.getUser()` is null. They rely entirely on RLS to filter results.
- **Affected area:** Job/booking detail page; the global SWR data fetch.
- **Likelihood / Impact / Risk:** Low / Medium / **Medium**. With the current RLS (finding #3) the requests will succeed for any authenticated user. If the policies are tightened, anonymous calls will still receive an empty `200` instead of a clear `401`, which is misleading. More importantly, the pattern is fragile — any tweak to RLS or an accidental anon policy would leak everything.
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Replace the manual session-client pattern with `requireUser()` from `lib/api/auth.ts` (used by most other routes). This both standardises behaviour and returns a deterministic 401 response.

### 14. No security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options) — **Low–Medium**

- **Description:** `next.config.mjs` defines no `headers()` and `vercel.json` configures none either. There is no Content-Security-Policy, no Strict-Transport-Security, no X-Frame-Options/`frame-ancestors`, no Referrer-Policy, no Permissions-Policy.
- **Affected area:** Entire frontend.
- **Likelihood / Impact / Risk:** Medium / Low / **Low–Medium**. Vercel adds a baseline `X-Content-Type-Options: nosniff` in some cases, but a deliberate CSP would block the stored-XSS scenarios in findings #8 and #9.
- **Effort estimate:** Medium (CSP nonce rollout requires per-page adjustments).
- **Cost implication:** Low.
- **Scope of fix:** Cross-cutting (`next.config.mjs` `async headers()`).
- **Recommended fix:** Add `headers()` to `next.config.mjs` exporting:
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Frame-Options: DENY` (and `Content-Security-Policy: frame-ancestors 'none'`)
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - `Content-Security-Policy: default-src 'self'; img-src 'self' data: https://*.supabase.co; …` — start in `Report-Only` mode, harden over time.

### 15. Dev-quick-login wired into production bundle — **Low–Medium**

- **Description:** `app/login/page.tsx:14–100` ships a `handleDevQuickLogin` button gated only by `process.env.NODE_ENV === "development"`. The default email list (`carmen@luxustravel.co.za`, `dirk@luxustravel.co.za`, etc.) and the default password (`password123`) are hard-coded into the source. While the UI button is hidden in production, the strings remain in the static bundle (`/_next/static/chunks/…`) and reveal real internal email addresses.
- **Affected area:** Login bundle, internal staff emails.
- **Likelihood / Impact / Risk:** Low / Medium / **Low–Medium**. Information disclosure: if any of those accounts still use `password123` (a real risk given finding #6), the credentials are effectively published.
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Move the dev-quick-login logic into a file that is tree-shaken in production (e.g. a dynamic `import('./dev-quick-login')` guarded by `if (process.env.NODE_ENV === "development")`), and replace hard-coded defaults with values pulled from a `.env.local`-only variable. Rotate the listed accounts' passwords if they have not been changed since onboarding.

### 16. `ws` < 8.20.1 uninitialized-memory disclosure — **Low**

- **Description:** GHSA-58qx-3vcg-4xpx (CVE-2026-45736, moderate) — `ws@8.19.0` is pulled in transitively via `@supabase/supabase-js → @supabase/realtime-js`. Exploit requires a peer to call `websocket.close(code, <TypedArray>)`.
- **Affected area:** Realtime websocket clients only.
- **Likelihood / Impact / Risk:** Low / Low / **Low**. The application uses `supabase.from(...)` and does not appear to expose realtime subscriptions with custom close payloads.
- **Effort estimate:** Low (wait for `@supabase/realtime-js` to bump, or apply a `pnpm.overrides` entry).
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Add a `pnpm.overrides` (or `pnpm.packageExtensions`) entry pinning `ws@^8.20.1`, or upgrade `@supabase/supabase-js` once a patched transitive is released.

### 17. `uuid` < 11.1.1 missing buffer bounds check — **Low**

- **Description:** GHSA-w5hq-g745-h8pq (CVE-2026-41907, moderate) — `uuid@10.0.0` via `resend → svix`. The vulnerable code path requires a caller passing a pre-allocated buffer to `v3`/`v5`/`v6`, which neither this app nor `svix` exercises.
- **Affected area:** Transitive only; functionally unreachable.
- **Likelihood / Impact / Risk:** Low / Low / **Low**.
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Track upstream `resend`/`svix` releases; apply a `pnpm.overrides` for `uuid@^11.1.1` if `pnpm audit` keeps surfacing it.

---

## 4. Priority Actions

Address in this order — the first three are highest risk-vs-effort wins:

1. **Lock down `POST /api/enquiries` (finding #1).** Add a Zod schema, IP rate limit, captcha, payload-size caps, and consider replacing the service-role client with a least-privileged Edge Function. Highest blast radius, modest effort.
2. **Upgrade `next` to `^16.2.5` (finding #2).** Single dependency bump that closes three High-severity CVEs. Verify build/test/QA pass.
3. **Disable Supabase public signup (finding #4)** and **raise the minimum password length to 12 with complexity requirements (finding #6).** Both are 2-line config changes with large impact; enable TOTP MFA for admin/manager at the same time.
4. **Tighten RLS policies (finding #3).** Replace `USING (true)` with policies that consult `auth.jwt()->>'clearance_level'`. This is the biggest structural fix and should be scheduled as a migration once the above quick wins land.
5. **Bump `vitest` to `^4.1.0` (finding #5)** and add `pnpm.overrides` for `ws` and `uuid` (findings #16, #17) — closes outstanding `pnpm audit` advisories.
6. **Add rate limiting (finding #7)** and **add security headers via `next.config.mjs` (finding #14).**
7. **Sanitise/disallow SVG uploads (finding #8), sanitise template HTML preview (finding #9), and fix CSV formula injection (finding #10)** — low-effort fixes against persistent-XSS and downstream-Excel attacks.
8. **Standardise CRON authentication using `timingSafeEqual` (finding #11)** and **replace the `.or()` escape in `/api/customers` (finding #12)** in the same cleanup pass.
9. **Move `/api/jobs/[id]` and `/api/data` to `requireUser()` (finding #13)** and **remove the dev-quick-login default credentials from the production bundle (finding #15).**

---

*Generated by an automated security review of the working tree on branch `claude/friendly-curie-taef68`. The review used static inspection of source, configuration, and migrations, plus `pnpm audit` against the current `pnpm-lock.yaml`. Re-run before each significant release.*
