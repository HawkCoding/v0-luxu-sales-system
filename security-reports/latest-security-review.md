# Security Review — Luxus Sales System

| Field | Value |
|---|---|
| Repository | `hawkcoding/v0-luxu-sales-system` |
| Branch reviewed | `claude/friendly-curie-FPPhl` |
| Run date | 2026-06-04 |
| App version | `3.22` (`lib/version.ts`) |
| Overall security posture | **Poor** |
| Highest-risk issue | Public unauthenticated `POST /api/enquiries` runs with `service_role` and bypasses Zod validation |
| Lowest-risk issue | Supabase project refs published in `.env.sync.local.example` |
| Total findings | 16 |

---

## 1. Summary

The codebase has reasonable shape (Zod at most boundaries, session-vs-service client split, AES-256-GCM for stored SMTP/IMAP creds, signed cron endpoints), but several high-impact gaps prevent it from being production-ready against a motivated attacker:

- **A public endpoint runs with `service_role` and no input validation** (`app/api/enquiries/route.ts`), allowing anonymous writes to `customers`, `bookings`, `quotes`, `audit_logs`, etc.
- **PostgREST RLS is effectively `USING (true)` for every `authenticated` user** on the core tables — all role/permission enforcement happens only in API-route code. A leaked anon key + any authenticated session can hit Supabase directly and read/delete everything.
- **`next@16.1.6` ships with 12 high-severity CVEs**, including SSRF, middleware/proxy bypasses, DoS, and segment-prefetch route bypasses. Patch is `>=16.2.6`.
- **The public `voucher-assets` storage bucket accepts `image/svg+xml`**, and the upload route also permits SVG — stored XSS surface if the asset ever renders inline same-origin.
- **`vitest <4.1.0`** has a critical RCE (UI-server arbitrary file read/exec). Dev-only, but ships in lockfile.
- No security headers, no rate limiting, weak min-6 password policy, plaintext IMAP allowed via schema, and stored-template HTML rendered with `dangerouslySetInnerHTML`.

Posture: **Poor.** Most exploitable issues require only a public network, an anon Supabase key, or basic OSINT — none of them require a privileged account.

---

## 2. Risk Matrix

| # | Issue | Likelihood | Impact | Risk Level |
|---|---|---|---|---|
| 1 | Public `POST /api/enquiries` uses service-role client with no Zod / no auth | High | High | **Critical** |
| 2 | Permissive RLS (`USING (true)`) on core business tables | Medium | High | **High** |
| 3 | `next@16.1.6` — 12 high-severity CVEs (SSRF, proxy bypass, DoS) | High | High | **High** |
| 4 | Public `voucher-assets` bucket allows SVG (stored-XSS surface) | Medium | High | **High** |
| 5 | `vitest <4.1.0` critical RCE via UI server (dev tooling) | Low | High | **High** |
| 6 | Unsanitised `dangerouslySetInnerHTML` for template `bodyHtml` | Medium | Medium | **Medium** |
| 7 | Weak password policy (min 6 chars) on `POST /api/users` and password-reset | Medium | Medium | **Medium** |
| 8 | Cron secret compared with `===` — timing side-channel | Low | Medium | **Medium** |
| 9 | No security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy) | High | Low | **Medium** |
| 10 | No rate limiting / lockout on login, public intake, password reset | High | Medium | **Medium** |
| 11 | `lodash<4.18.0` RCE via `_.template` (transitive via `recharts`) | Low | Medium | **Medium** |
| 12 | `vite<7.3.2` arbitrary file read / `fs.deny` bypass (dev only) | Low | Medium | **Medium** |
| 13 | `imap_encryption: "none"` allowed in `salesperson-credentials` schema | Low | Medium | **Medium** |
| 14 | All authenticated users can read `audit_logs` via direct PostgREST | Medium | Medium | **Medium** |
| 15 | `uuid<11.1.1` missing buffer bounds (transitive via `resend → svix`) | Low | Low | **Low** |
| 16 | Supabase project refs published in `.env.sync.local.example` | Low | Low | **Low** |

---

## 3. Detailed Findings

### 1. Public `POST /api/enquiries` runs with `service_role` and skips Zod validation
**Affected area:** `app/api/enquiries/route.ts:410-704`
**Description:** The handler is reachable without any auth check, calls `createServiceClient()` (RLS-bypassing), and then writes directly to `customers`, `bookings`, `booking_suites`, `travellers`, `booking_transport_requests`, `booking_vehicle_rental_details`, `quotes`, `quote_line_items`, and `audit_logs`. Body fields are accessed as `body.email`, `body.travellers`, etc. — there is no Zod schema, no size limit, no rate limit, and no captcha. The comment "shape is validated at the Zod boundary above" (line 572) is incorrect — no Zod runs here.
**Likelihood / Impact / Risk:** High / High / **Critical**
**Effort:** Medium · **Cost:** Medium · **Scope:** Localised (one route + add a shared limiter helper)
**Recommended fix:** Define a `z.object({...}).strict()` schema for the full payload (including travellers/transport requests). Replace `createServiceClient()` with a narrow service call only for the customer/booking inserts that actually need RLS bypass, and authenticate every other path via `createSessionClient()`. Add per-IP and per-email rate limiting (e.g. Upstash Ratelimit or `@vercel/kv`). Add Turnstile/hCaptcha on the public form. Limit `rawText` and array sizes (`travellers`, `transportRequests`) to bound DB load.

---

### 2. RLS policies are effectively `USING (true)` for every authenticated user
**Affected area:** `supabase/migrations/20260308095136_remote_schema.sql:CREATE POLICY … USING (true)` for `bookings`, `customers`, `payments`, `quotes`, `quote_line_items`, `documents`, `correspondences`, `audit_logs`, etc.
**Description:** Although RLS is enabled, the policies grant blanket SELECT/INSERT/UPDATE/DELETE to the `authenticated` role. The `NEXT_PUBLIC_SUPABASE_ANON_KEY` is shipped to the browser, so any authenticated user (consultant, readonly, or anyone who can sign up) can call PostgREST directly (e.g. `/rest/v1/customers?select=*`) and bypass every clearance check in `lib/api/auth.ts`.
**Likelihood / Impact / Risk:** Medium / High / **High**
**Effort:** High · **Cost:** Medium · **Scope:** Cross-cutting (migrations + every protected table)
**Recommended fix:** Replace the open policies with role-aware ones that read `auth_has_role(...)` (already defined at `supabase/migrations/20260523100000_sync_remote_rls_and_functions.sql:7`). For example, `audit_logs` should be `USING (auth_has_role(ARRAY['admin','manager']))`, and ownership-restricted tables should compare `auth.uid()` to `owner_user_id` / `assigned_salesperson_id`. Add regression tests that hit PostgREST directly with each role to lock policies in.

---

### 3. Next.js 16.1.6 — 12 high-severity CVEs
**Affected area:** `package.json:101` (`"next": "16.1.6"`)
**Description:** `pnpm audit` reports DoS via Server Components (GHSA-q4gf-8mx6-v5v3, GHSA-8h8q-6873-q5fj, GHSA-mg66-mrh9-m8jx), SSRF via WebSocket upgrade (GHSA-c4j6-fc7j-m34r), middleware/proxy bypass via segment-prefetch and dynamic params (GHSA-26hh-7cqf-hhc6, GHSA-492v-c6pp-mqqv, GHSA-267c-6grr-h53f, GHSA-36qx-fr4f-26g5), plus several lower-severity proxy / cache-poisoning issues. All fixed in `next >= 16.2.6`. This project relies on the proxy (`proxy.ts`) for cookie refresh / `/login` redirect, so the proxy-bypass class is directly relevant.
**Likelihood / Impact / Risk:** High / High · **High**
**Effort:** Low · **Cost:** Low · **Scope:** Localised (dependency bump + smoke test)
**Recommended fix:** `pnpm add next@^16.2.6` (currently latest), regenerate the lockfile, re-run `pnpm test:ci` and the QA Playwright suite. Confirm the proxy still redirects `/login → /app` and the SWR-fed routes still pass.

---

### 4. Public `voucher-assets` bucket accepts SVG — stored-XSS surface
**Affected area:** `supabase/migrations/20260506130000_voucher_assets_bucket.sql:9` (public bucket, `image/svg+xml` allowed) and `app/api/voucher-template/upload/route.ts:9-27` (admin upload accepts SVG)
**Description:** SVGs can contain `<script>` and event handlers. Because the bucket is `public`, the URL is served from the Supabase storage origin — currently safe against the app cookies — but the same URL is also embedded directly inside generated voucher HTML and emails, and the project explicitly documents that the file is rendered "inline" for PDFs/emails. If any future feature renders the asset same-origin (e.g. a logo preview iframe or PDF preview component), this becomes stored XSS exploitable by any admin who can upload.
**Likelihood / Impact / Risk:** Medium / High · **High**
**Effort:** Low · **Cost:** Low · **Scope:** Localised (bucket migration + upload route)
**Recommended fix:** Drop `image/svg+xml` from the bucket's `allowed_mime_types` and from `ALLOWED_KINDS` MIME maps; or, if SVG must stay, sanitise on upload with `DOMPurify` (server-side) and serve via a signed URL on a sandboxed subdomain. Add `Content-Disposition: attachment` to bucket-served assets that are not whitelisted MIMEs.

---

### 5. Vitest < 4.1.0 critical RCE via UI server
**Affected area:** `package.json:137` (`"vitest": "^4.0.18"`), GHSA-5xrq-8626-4rwp
**Description:** When the Vitest UI is started, an arbitrary file can be read and executed. Dev tool only, but contributors who run `pnpm vitest --ui` while browsing untrusted pages are exposed.
**Likelihood / Impact / Risk:** Low / High · **High**
**Effort:** Low · **Cost:** Low · **Scope:** Localised
**Recommended fix:** `pnpm add -D vitest@^4.1.0 @vitest/coverage-v8@^4.1.0`.

---

### 6. Unsanitised `dangerouslySetInnerHTML` renders stored template HTML
**Affected area:** `app/app/templates/page.tsx:185`
**Description:** `preview?.bodyHtml` is rendered into the DOM with no sanitisation. The HTML originates from the `templates` table, which (per `app/api/templates/route.ts`) is editable by any authenticated user reaching the page. A malicious template body becomes a stored XSS in the admin UI; the same template can also be the body of outbound emails — propagating to recipient mail clients.
**Likelihood / Impact / Risk:** Medium / Medium · **Medium**
**Effort:** Low · **Cost:** Low · **Scope:** Localised
**Recommended fix:** Sanitise with `DOMPurify` (browser bundle) before injecting, or render the body inside a sandboxed `<iframe srcDoc>` with `sandbox="allow-same-origin"` stripped. Restrict the `/templates` UI route to admin/manager via `requireRole`.

---

### 7. Weak password policy — 6-character minimum
**Affected area:** `app/api/users/route.ts:20` (`z.string().min(6, ...)`) and `app/api/users/[userId]/password/route.ts:59` (`newPassword.length < 6`)
**Description:** OWASP ASVS 4.0 and current NIST SP 800-63B require at least 8 characters (12+ recommended) and checks against breached-password lists. The current limit allows `123456`. Admin-set passwords are also emailed in plain instructions — no forced rotation on first login.
**Likelihood / Impact / Risk:** Medium / Medium · **Medium**
**Effort:** Low · **Cost:** Low · **Scope:** Localised
**Recommended fix:** Raise to `min(12)`; add an entropy check or integrate HaveIBeenPwned k-anonymity. Force a password change on first sign-in for admin-created accounts (`force_password_change` on profile).

---

### 8. Cron secret compared with `===` — timing side-channel
**Affected area:** `app/api/cron/backup/route.ts:10`, `app/api/cron/email-sync/route.ts:7`, `app/api/cron/payment-reminders/route.ts:8`, `app/api/cron/pipeline-auto-close/route.ts:42`, `app/api/cron/quote-follow-ups/route.ts:8`
**Description:** `authHeader !== \`Bearer ${process.env.CRON_SECRET}\`` short-circuits on the first mismatched byte. Remote timing is noisy but exploitable against a public endpoint over many requests, and Vercel cron endpoints are reachable from anywhere.
**Likelihood / Impact / Risk:** Low / Medium · **Medium**
**Effort:** Low · **Cost:** Low · **Scope:** Cross-cutting (5 files, fix via shared helper)
**Recommended fix:** Replace the comparison with `crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected))` after length-equality check. Extract into `lib/api/verify-cron.ts` and reuse.

---

### 9. No HTTP security headers
**Affected area:** `next.config.mjs:1-9`, `vercel.json:1-29`
**Description:** Neither `next.config.mjs` nor `vercel.json` defines `headers()`. The app ships without CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy or Permissions-Policy. This amplifies the impact of issues 4 and 6.
**Likelihood / Impact / Risk:** High / Low · **Medium**
**Effort:** Low · **Cost:** Low · **Scope:** Localised
**Recommended fix:** Add a `headers()` function in `next.config.mjs` returning at minimum: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and a CSP that allows the Supabase origin plus `self`. Iterate the CSP from report-only to enforce.

---

### 10. No rate limiting on login, public intake, or password reset
**Affected area:** `app/login/page.tsx`, `app/api/enquiries/route.ts`, `app/api/users/[userId]/password/route.ts`
**Description:** Login uses Supabase Auth defaults (currently unlimited per IP); the public enquiry POST has no throttling; the admin password-reset has no per-target lockout. Combined with the weak password policy (issue 7) this enables credential stuffing and customer-record stuffing.
**Likelihood / Impact / Risk:** High / Medium · **Medium**
**Effort:** Medium · **Cost:** Low · **Scope:** Cross-cutting
**Recommended fix:** Adopt `@upstash/ratelimit` or `@vercel/kv` and wrap a `withRateLimit(req, key, limit)` helper around the public/auth endpoints. Configure Supabase Auth to enforce its own per-IP throttle.

---

### 11. `lodash < 4.18.0` RCE via `_.template`
**Affected area:** `pnpm-lock.yaml` — `recharts → lodash` (GHSA-r5fr-rjxr-66jc)
**Description:** Transitive dependency. Only exploitable when user-controlled data reaches `_.template`; recharts itself does not appear to, but the vulnerable version sits in the production bundle.
**Likelihood / Impact / Risk:** Low / Medium · **Medium**
**Effort:** Low · **Cost:** Low · **Scope:** Localised
**Recommended fix:** Add a `pnpm.overrides` entry for `lodash` to `^4.18.0`, or wait for `recharts` to publish a bumped release.

---

### 12. `vite < 7.3.2` arbitrary file read / `fs.deny` bypass
**Affected area:** `pnpm-lock.yaml` — `vite-tsconfig-paths → vite` (GHSA-v2wj-q39q-566r, GHSA-p9ff-h696-f583)
**Description:** Dev-tool only. A malicious site can read arbitrary files from a contributor's machine while the Vite dev server is bound.
**Likelihood / Impact / Risk:** Low / Medium · **Medium**
**Effort:** Low · **Cost:** Low · **Scope:** Localised
**Recommended fix:** Add a `pnpm.overrides` for `vite` to `^7.3.2`.

---

### 13. `imap_encryption: "none"` allowed in `salesperson-credentials`
**Affected area:** `app/api/settings/salesperson-credentials/route.ts:18`
**Description:** The Zod enum accepts `"none"`, letting an admin save IMAP creds that flow in plaintext over the network. Combined with the host default `mail.sa-rail.co.za`, this would expose mailbox credentials to passive observers.
**Likelihood / Impact / Risk:** Low / Medium · **Medium**
**Effort:** Low · **Cost:** Low · **Scope:** Localised
**Recommended fix:** Drop `"none"` from the enum (also for `smtp_encryption`) and require SSL or STARTTLS.

---

### 14. All authenticated users can read `audit_logs` via direct PostgREST
**Affected area:** `supabase/migrations/20260308095136_remote_schema.sql` (`al_select … USING (true)`); `app/api/data/route.ts:42` already gates audit log access to `admin`/`manager` in the API
**Description:** The API layer correctly filters audit log access by clearance level. The RLS policy does not. Any user with the anon key and a session can `GET /rest/v1/audit_logs?select=*` and read PII (`actor`, `entity_id`, `meta_json`).
**Likelihood / Impact / Risk:** Medium / Medium · **Medium**
**Effort:** Low · **Cost:** Low · **Scope:** Localised (one policy)
**Recommended fix:** `ALTER POLICY al_select ON audit_logs USING (auth_has_role(ARRAY['admin','manager']::user_role[]));`. Same treatment for `pipeline_history` and any other table containing PII.

---

### 15. `uuid < 11.1.1` missing buffer bounds check
**Affected area:** `pnpm-lock.yaml` — `resend → svix → uuid` (GHSA-w5hq-g745-h8pq)
**Description:** Transitive; only triggers when a caller passes a too-small `buf` argument, which Resend does not. Low impact in practice.
**Likelihood / Impact / Risk:** Low / Low · **Low**
**Effort:** Low · **Cost:** Low · **Scope:** Localised
**Recommended fix:** `pnpm.overrides` for `uuid` to `^11.1.1`, or wait for `svix` to update.

---

### 16. Supabase project refs in `.env.sync.local.example`
**Affected area:** `.env.sync.local.example:11-12` (`SUPABASE_DEV_PROJECT_REF=isxpuhttwzyvjclrnhbg`, `SUPABASE_PROD_PROJECT_REF=qlwldfhjfbxliyjvoziu`)
**Description:** Project refs are not secrets but they hand attackers the exact Supabase URL (`https://<ref>.supabase.co`) to test the anon key + RLS on, and to use in social-engineering ("we noticed an issue with project xyz…").
**Likelihood / Impact / Risk:** Low / Low · **Low**
**Effort:** Low · **Cost:** Low · **Scope:** Localised
**Recommended fix:** Replace the ref values with placeholders (`<dev-project-ref>`, `<prod-project-ref>`) — the file is already designed for placeholders elsewhere.

---

## 4. Priority Actions

Address the issues below first — they are the highest-risk wins for the smallest effort.

1. **Lock down `POST /api/enquiries` (Finding 1)** — add Zod schema, drop service-role for non-RLS-bypassing writes, add rate limiting + captcha. *Effort: medium · Risk killed: critical.*
2. **Bump `next` to `^16.2.6` and `vitest` to `^4.1.0` (Findings 3, 5)** — one-line dependency change closes 13 advisories. *Effort: low · Risk killed: 2× high.*
3. **Tighten RLS policies (Findings 2, 14)** — switch `USING (true)` to `auth_has_role(...)` / ownership predicates on `customers`, `bookings`, `payments`, `quotes`, `documents`, `audit_logs`, `pipeline_history`. *Effort: high but mostly mechanical · Risk killed: high.*
4. **Remove SVG from voucher-assets bucket (Finding 4)** — migration + upload-route enum tweak. *Effort: low · Risk killed: high.*
5. **Add security headers via `next.config.mjs` (Finding 9)** — defence-in-depth that also reduces blast radius for findings 4 and 6. *Effort: low · Risk killed: medium.*
6. **Raise password minimum to 12 and force first-login change (Finding 7)** — quick schema edits in two routes. *Effort: low · Risk killed: medium.*
7. **Switch CRON_SECRET compare to `timingSafeEqual` (Finding 8)** — single helper, used by five routes. *Effort: low · Risk killed: medium.*

After these, return for the remaining medium/low findings (rate limiting on auth, IMAP `"none"`, template HTML sanitisation, lodash/vite/uuid overrides, project-ref scrub).
