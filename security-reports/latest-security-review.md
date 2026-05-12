# Security Review — Luxus Sales System

| Field | Value |
| --- | --- |
| Repository | `hawkcoding/v0-luxu-sales-system` |
| Run date | 2026-05-12 |
| Branch reviewed | `claude/friendly-curie-YHIUQ` |
| Overall security posture | **Moderate** (one critical authorization gap drags down an otherwise solid baseline) |
| Highest-risk issue | Permissive Supabase RLS policies allow authenticated users to bypass API role checks |
| Lowest-risk issue | Public `voucher-assets` storage bucket allows anonymous reads of asset URLs |
| Total findings | 15 |

---

## 1. Summary

- **Total vulnerabilities / issues:** 15
- **Highest-risk issue:** *Permissive RLS — `USING (true)`* on all business tables (customers, bookings, payments, quotes, etc.). Any authenticated user (including `readonly` and `consultant`) can bypass every API-layer role check by calling Supabase REST directly with their JWT.
- **Lowest-risk issue:** *Public `voucher-assets` storage bucket* — intentional for image embedding, but predictable paths could leak template assets if anonymous access becomes undesirable.
- **Overall posture:** **Moderate.** Authentication patterns, encryption of stored IMAP credentials, cron secret gating, audit logging, parameterised Supabase queries, and Zod validation in most routes are all in good shape. The weak link is the permissive RLS — combined with a public unauthenticated `/api/enquiries` ingress and a 6-character password floor, the effective authorisation surface is much broader than the code suggests.

---

## 2. Risk Matrix

| # | Issue | Likelihood | Impact | Risk Level |
| - | --- | --- | --- | --- |
| 1 | Permissive RLS policies on business tables (`USING (true)`) | High | High | **Critical** |
| 2 | Unauthenticated `/api/enquiries` writes via service-role client (no rate limit / CAPTCHA / Zod) | High | High | **High** |
| 3 | Weak password policy (min 6 chars; no complexity) on user create + admin reset | High | Medium | **High** |
| 4 | PostgREST `.or()` filter injection via insufficient escaping (`customers`, `audit_logs`) | Medium | Medium | **Medium** |
| 5 | No HTTP security headers (CSP / HSTS / X-Frame-Options / Referrer-Policy / Permissions-Policy) | High | Low | **Medium** |
| 6 | `dangerouslySetInnerHTML` on email-template preview without sanitisation | Medium | Medium | **Medium** |
| 7 | Hardcoded dev quick-login emails and `password123` in client bundle | Medium | Medium | **Medium** |
| 8 | Cron `Bearer` secret compared with `!==` (non-constant-time) | Low | Medium | **Low–Medium** |
| 9 | Sensitive PII (passport / ID / DOB) accepted from unauthenticated public form without strong validation | Medium | Medium | **Medium** |
| 10 | No documented `EMAIL_CREDENTIAL_ENCRYPTION_KEY` and `CRON_SECRET` in `.env.local.example` | Medium | Low | **Low** |
| 11 | Verbose error responses (phase + raw Supabase details) when `NODE_ENV !== "production"` | Low | Medium | **Low** |
| 12 | Public `voucher-assets` storage bucket reads | Low | Low | **Low** |
| 13 | No length/size limits on `rawText`, `additionalServicesDetails`, etc. in public intake | Medium | Low | **Low** |
| 14 | No CSRF tokens on state-changing POSTs (mitigated by SameSite=Lax cookies) | Low | Medium | **Low** |
| 15 | `lodash@4.17.23` resolved in lockfile — verify provenance (last public stable is 4.17.21) | Low | Medium | **Low** |

---

## 3. Detailed Findings

### 1. Permissive RLS policies on business tables — **Critical**
- **Description:** `supabase/migrations/20260308095136_remote_schema.sql` enables RLS on `customers`, `bookings`, `payments`, `quotes`, `documents`, `travellers`, `correspondences`, etc., but every policy is defined as `FOR <op> TO authenticated USING (true) WITH CHECK (true)`. The browser uses `getSupabase()` with the anon key + the user's JWT, so any logged-in user can directly `SELECT/INSERT/UPDATE/DELETE` any row in these tables via PostgREST, completely bypassing the role checks in `lib/api/auth.ts`, `lib/settings-access.ts`, and route-level `allowedRoles` sets.
- **Affected area:** All `public.*` business tables; database authorization layer.
- **Likelihood / Impact / Risk:** High / High / **Critical**
- **Effort Estimate:** Medium (needs role-aware policies referencing `auth.uid()` and the existing `auth_has_role()` helper).
- **Cost Implication:** Medium (testing + migration roll-out).
- **Scope of Fix:** Cross-cutting (every business table + helper functions).
- **Recommended Fix:**
  1. Replace `USING (true) / WITH CHECK (true)` with role gates, e.g. `USING (public.auth_has_role(ARRAY['admin','manager','consultant']::public.user_role[]))` for read, and stricter mutate policies (`admin`/`manager`-only for `DELETE`, payments writes, etc.).
  2. Scope sensitive writes to ownership: `bookings`, `payments`, `quotes` should require `assigned_salesperson_id = auth.uid()` for consultants, with admin/manager bypass.
  3. Add a `block_anon` policy for the `anon` role on `customers`/`bookings` so the service-role intake path is the only public writer.
  4. Add regression tests that authenticate as a `readonly` user and assert that direct PostgREST writes fail.

### 2. Unauthenticated `/api/enquiries` writes via service-role client — **High**
- **Description:** `app/api/enquiries/route.ts` builds a `createServiceClient()` (RLS-bypassing) and accepts arbitrary JSON. There is **no** Zod validation (only `typeof` checks), no rate limit, no CAPTCHA, and no length cap. Anyone on the internet can create unlimited `customers`, `bookings`, `booking_suites`, `travellers`, `booking_transport_requests`, `quotes`, `quote_line_items`, and `audit_logs` rows.
- **Affected area:** `app/api/enquiries/route.ts:225-479`, `lib/supabase/server.ts:45-62` (service client usage).
- **Likelihood / Impact / Risk:** High / High / **High**
- **Effort Estimate:** Medium.
- **Cost Implication:** Low–Medium (Vercel rate limit / Upstash Redis / Turnstile).
- **Scope of Fix:** Localised to the enquiries route + shared middleware for rate-limiting.
- **Recommended Fix:**
  1. Add an explicit Zod schema for the entire body (mirror `app/api/customers/import/schemas.ts` style) including length caps on `rawText`, `additionalServicesDetails`, `notes`.
  2. Gate writes behind a CAPTCHA / Cloudflare Turnstile token or an HMAC-signed token issued by the public website.
  3. Apply per-IP rate limiting (e.g. `@upstash/ratelimit`) at the route entrypoint. Reject when burst > N.
  4. Keep the service-role client but only after the above guards pass; consider running this in a dedicated route group with stricter logging.

### 3. Weak password policy (6-character minimum) — **High**
- **Description:** User creation (`app/api/users/route.ts:20`) and admin password reset (`app/api/users/[userId]/password/route.ts:59`) both enforce `password.length >= 6` with no complexity, breach check, or maximum length. OWASP ASVS L1 requires ≥8 chars; modern guidance is ≥12 or passphrase. There is also no enforcement of password rotation, MFA, or NIST-style breached-password check.
- **Affected area:** Admin user-management endpoints + Supabase Auth project configuration.
- **Likelihood / Impact / Risk:** High / Medium / **High**
- **Effort Estimate:** Low (Zod min change + Supabase Auth project setting).
- **Cost Implication:** Low.
- **Scope of Fix:** Localised.
- **Recommended Fix:** Raise minimum to 12 characters; reject any password matching a HaveIBeenPwned k-anonymity check (e.g. `pwnedpasswords` lookup) or use Supabase Auth's built-in "password strength" / "leaked password protection" toggle. Document the rule in the admin UI. Enable MFA for `admin`/`manager` roles in the Supabase project.

### 4. PostgREST `.or()` filter injection — **Medium**
- **Description:** `app/api/customers/route.ts:38-43` and `lib/audit.ts:251-256` build an `.or()` filter by string-interpolating a user-supplied `search` value. The escape only handles `%`, `_`, and `,`. PostgREST treats `(`, `)`, `*`, `"`, and `\` as structural characters in `or=` syntax. Authenticated callers can craft inputs that change the resulting filter (e.g. injecting another column predicate) and exfiltrate or enumerate rows beyond the intended search columns. Impact is partially bounded by RLS — but given finding #1, RLS does not constrain this in practice.
- **Affected area:** `app/api/customers/route.ts:38-43`, `lib/audit.ts:251-256`.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**
- **Effort Estimate:** Low.
- **Cost Implication:** Low.
- **Scope of Fix:** Localised.
- **Recommended Fix:** Escape the full set of PostgREST special chars (`%`, `_`, `,`, `(`, `)`, `*`, `"`, `\`), wrap values in `"..."` per PostgREST docs, or replace `.or()` with parameterised RPC functions / multiple chained filters. Reject `search` strings shorter than 2 or longer than 80 chars.

### 5. Missing HTTP security headers — **Medium**
- **Description:** `next.config.mjs` defines only `images: { unoptimized: true }`. No `headers()` block; no CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, or Permissions-Policy. Vercel does not apply these automatically. Combined with `dangerouslySetInnerHTML` in finding #6, the lack of CSP increases XSS impact.
- **Affected area:** `next.config.mjs`.
- **Likelihood / Impact / Risk:** High / Low / **Medium**
- **Effort Estimate:** Low.
- **Cost Implication:** Low.
- **Scope of Fix:** Localised (one file).
- **Recommended Fix:** Add a `headers()` export returning at least:
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-Frame-Options: DENY`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - A nonce-based or strict `Content-Security-Policy` (initially in report-only mode).

### 6. `dangerouslySetInnerHTML` on email template preview — **Medium**
- **Description:** `app/app/templates/page.tsx:185` renders `preview?.bodyHtml` directly with `dangerouslySetInnerHTML`. Email templates are admin/manager-editable, so a compromised admin or a future bug allowing lower-privilege writes (see finding #1) could inject script. The same render path is used for inbound email previews in correspondences views.
- **Affected area:** `app/app/templates/page.tsx:185`, any other surfaces that render `bodyHtml`.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**
- **Effort Estimate:** Low.
- **Cost Implication:** Low.
- **Scope of Fix:** Localised.
- **Recommended Fix:** Sanitise with `DOMPurify` (`isomorphic-dompurify`) at render time or render inside a sandboxed `<iframe sandbox>` so scripts can't execute. Pair with the CSP from finding #5.

### 7. Hardcoded dev quick-login credentials in client bundle — **Medium**
- **Description:** `app/login/page.tsx:14-100` defines five real staff emails and the password `password123` as module-level constants, gated by `process.env.NODE_ENV === "development"`. Next.js inlines `process.env.NODE_ENV` at build time, so production builds *should* tree-shake the block — but the constants are declared at module scope and the gate is on `canUseDevQuickLogin`, not on the constants themselves. Minifiers may still keep the strings. More importantly, this strongly suggests that the same five accounts exist in shared dev/preview Supabase projects with the password `password123` — those projects often share networks with prod or hold copies of real data.
- **Affected area:** `app/login/page.tsx`; dev/preview Supabase auth users.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**
- **Effort Estimate:** Low.
- **Cost Implication:** Low.
- **Scope of Fix:** Localised.
- **Recommended Fix:** Move the constants behind `if (process.env.NODE_ENV === "development")` and lazily read them inside `getDevQuickLoginCandidates()`. Better: read from `localStorage` only (no env / no defaults). Rotate the dev passwords to per-developer values and audit the dev/preview Supabase projects for `password123` users.

### 8. Non-constant-time cron secret comparison — **Low–Medium**
- **Description:** `app/api/cron/email-sync/route.ts:7` and `app/api/cron/pipeline-auto-close/route.ts:42` compare the bearer header with `authHeader !== \`Bearer ${process.env.CRON_SECRET}\``. JavaScript's `!==` short-circuits and is not constant-time, theoretically allowing timing side-channel discovery of the secret. Mitigated by Vercel's edge network, but trivial to fix.
- **Affected area:** Both cron route handlers.
- **Likelihood / Impact / Risk:** Low / Medium / **Low–Medium**
- **Effort Estimate:** Low.
- **Cost Implication:** Low.
- **Scope of Fix:** Localised.
- **Recommended Fix:** Use `crypto.timingSafeEqual` on equal-length buffers, e.g.

  ```ts
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET}`)
  const actual = Buffer.from(authHeader ?? "")
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) { ... }
  ```

### 9. Sensitive PII accepted on public form without strong validation — **Medium**
- **Description:** `/api/enquiries` accepts `idPassport` and `dateOfBirth` for adults and children and inserts them into `public.travellers`. There is no Zod schema, no format validation, no length cap, and no consent check. POPIA / GDPR Article 5 require minimisation and lawful basis. Storing unverified passport numbers from an open form is high-risk.
- **Affected area:** `app/api/enquiries/route.ts:382-413` (`travellers` insert path) + `lib/types.ts` types.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**
- **Effort Estimate:** Medium.
- **Cost Implication:** Low.
- **Scope of Fix:** Localised plus a small migration to scrub historical data.
- **Recommended Fix:** Stop collecting passport/ID/DOB from the public enquiry form. Collect only after the customer has authenticated or after manual qualification. If retained, enforce strict regex on the server, encrypt at rest (column-level), and document POPIA basis. Add a retention policy that purges these columns when `stage = closed` after N days.

### 10. Undocumented required secrets in `.env.local.example` — **Low**
- **Description:** `EMAIL_CREDENTIAL_ENCRYPTION_KEY` (required by `lib/inbound-email/crypto.ts:7`) and `CRON_SECRET` (required by both cron routes) are not listed in `.env.local.example`. New developers will hit cryptic runtime errors and may stub the key with a weak placeholder, weakening the per-environment encryption secret.
- **Affected area:** `.env.local.example`, `.env.sync.local.example`.
- **Likelihood / Impact / Risk:** Medium / Low / **Low**
- **Effort Estimate:** Low.
- **Cost Implication:** Low.
- **Scope of Fix:** Localised.
- **Recommended Fix:** Add both keys with instructions to generate (`openssl rand -base64 32`). Add a startup assertion in production that both are set and meet a minimum entropy threshold.

### 11. Verbose error responses outside production — **Low**
- **Description:** `app/api/customers/import/route.ts:65-89` returns `phase`, `traceId`, and raw Supabase `details`/`hint`/`code` when `NODE_ENV !== "production"`. If a preview deployment is publicly reachable and not built with `NODE_ENV=production`, this leaks schema details to anyone.
- **Affected area:** `app/api/customers/import/route.ts` + any preview deployment configuration.
- **Likelihood / Impact / Risk:** Low / Medium / **Low**
- **Effort Estimate:** Low.
- **Cost Implication:** Low.
- **Scope of Fix:** Localised.
- **Recommended Fix:** Gate diagnostics on a dedicated `DEBUG_API_DIAGNOSTICS=1` flag rather than `NODE_ENV`. Confirm Vercel preview builds run with `NODE_ENV=production` (they do by default for `next build`, but `next dev` runs with development).

### 12. Public `voucher-assets` storage bucket — **Low**
- **Description:** `supabase/migrations/20260506130000_voucher_assets_bucket.sql:6` sets `public = true`. Anyone with a URL can download logos, banners, or anything else uploaded by admins. Filenames are deterministic and may be enumerable.
- **Affected area:** `voucher-assets` bucket configuration.
- **Likelihood / Impact / Risk:** Low / Low / **Low**
- **Effort Estimate:** Low.
- **Cost Implication:** Low.
- **Scope of Fix:** Localised.
- **Recommended Fix:** Keep public if branding only. If template assets ever include private content (e.g. signed letterheads), switch to a private bucket with signed URLs (matches the `vouchers` bucket pattern).

### 13. No size limits on free-text fields in `/api/enquiries` — **Low**
- **Description:** `rawText`, `additionalServicesDetails`, `notes`, and `extracted_json` are written without server-side length caps. Hostile callers can flood the database with megabytes per request.
- **Affected area:** `app/api/enquiries/route.ts`.
- **Likelihood / Impact / Risk:** Medium / Low / **Low**
- **Effort Estimate:** Low.
- **Cost Implication:** Low.
- **Scope of Fix:** Localised.
- **Recommended Fix:** Add Zod `.max()` limits (e.g. `rawText.max(50_000)`, `additionalServicesDetails.max(5_000)`) and a `Content-Length` check on the request itself.

### 14. No CSRF tokens on state-changing POSTs — **Low**
- **Description:** Auth uses Supabase SSR cookies (HTTP-only, SameSite=Lax). Cross-site forms cannot read the cookie, but `SameSite=Lax` still allows top-level navigations to send the cookie on POSTs, which is partially mitigated by JSON-only routes (browsers won't auto-send JSON cross-site with the default `Content-Type`). There is no double-submit token or Origin/Referer check as defence-in-depth.
- **Affected area:** All `/api/**` POST routes.
- **Likelihood / Impact / Risk:** Low / Medium / **Low**
- **Effort Estimate:** Low–Medium.
- **Cost Implication:** Low.
- **Scope of Fix:** Cross-cutting.
- **Recommended Fix:** Add an `Origin`/`Referer` allow-list check in `proxy.ts` for mutating requests; reject when neither matches `process.env.APP_ORIGIN`.

### 15. `lodash@4.17.23` lockfile entry — **Low**
- **Description:** `pnpm-lock.yaml` resolves `lodash@4.17.23`. The last widely-known public release on npm is `4.17.21` (fixes CVE-2021-23337). 4.17.23 should be verified against npm and against the lockfile integrity hash to rule out a typo-squat / supply-chain artefact. (Transitive — likely pulled by `mailparser`/`nodemailer`/Resend SDK.)
- **Affected area:** `pnpm-lock.yaml`.
- **Likelihood / Impact / Risk:** Low / Medium / **Low**
- **Effort Estimate:** Low.
- **Cost Implication:** Low.
- **Scope of Fix:** Localised.
- **Recommended Fix:** Run `pnpm why lodash` and `pnpm audit` to confirm provenance; pin to `4.17.21` via `pnpm overrides` if the 4.17.23 entry cannot be traced to the public registry.

---

## 4. Priority Actions

Ordered by **risk reduction × effort**:

1. **Tighten RLS policies** (Finding #1, Critical, Medium effort) — biggest single win; everything else assumes RLS holds.
2. **Harden `/api/enquiries`** (Finding #2, High) — add Zod schema, rate limit, CAPTCHA. Quick win against abuse.
3. **Raise password floor + enable leaked-password protection in Supabase Auth** (Finding #3, High, Low effort).
4. **Add HTTP security headers in `next.config.mjs`** (Finding #5, Medium, Low effort) — pure config change.
5. **Sanitise `dangerouslySetInnerHTML` previews** (Finding #6, Medium, Low effort).
6. **Fix `.or()` filter escaping** (Finding #4, Medium, Low effort).
7. **Switch cron `Bearer` comparison to `timingSafeEqual`** (Finding #8, Low effort).
8. **Move dev quick-login defaults behind a function and rotate dev passwords** (Finding #7).
9. **Document and validate `EMAIL_CREDENTIAL_ENCRYPTION_KEY` / `CRON_SECRET`** (Finding #10).
10. **Reduce PII collected by the public form / encrypt at rest** (Finding #9).

The first three items remove the bulk of real-world exploitable risk and are achievable in a single sprint.

---

*Generated 2026-05-12 by automated security review on branch `claude/friendly-curie-YHIUQ`.*
