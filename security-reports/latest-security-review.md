# Security Review — Luxus Sales System

| Field | Value |
|---|---|
| Repository | `hawkcoding/v0-luxu-sales-system` |
| Branch reviewed | `claude/friendly-curie-e2vPs` |
| App version | `2.58` (`lib/version.ts`) |
| Run date | 2026-05-18 |
| Reviewer | Automated security review (Claude) |
| Overall security posture | **Moderate** |
| Total findings | **15** |
| Highest-risk issue | **F-01 — Public `/api/enquiries` route uses the Supabase service-role key, accepts unvalidated input, and has no rate-limiting** |
| Lowest-risk issue | **F-15 — No dependency vulnerability scanning step in CI** |

---

## 1. Summary

The application is an internal Next.js 16 / Supabase booking system. Authentication is generally enforced at the API boundary via `requireUser` / `requireRole` / `requireAdminSettingsAccess`, sensitive credentials are encrypted at rest with AES-256-GCM, and outbound vouchers/PDFs are stored in a private bucket with role-scoped policies. CRON endpoints are gated by `CRON_SECRET`.

However, the public enquiry intake route is the single biggest weakness: it runs under the **service-role JWT** (bypassing RLS entirely), accepts arbitrary JSON without a Zod schema, has no rate-limiting, and writes to `customers`, `bookings`, `quotes`, `travellers`, `audit_logs`, etc. A second class of issues stems from RLS policies that resolve to `USING (true)` on every business table — defence-in-depth is effectively absent at the database layer for any authenticated user. A weak (6-character, no-complexity) password policy and the absence of HTTP security headers further weaken the posture.

No critical CVEs were observed in the pinned dependency set (`next@16.1.6`, `react@19.2.4`, `@supabase/ssr@0.8.x`, `imapflow@1.3.x`, `mailparser@3.9.8`, `zod@3.24.x`). A `pnpm audit` step is not part of CI, so this signal is only as good as today's reading.

## 2. Risk Matrix

| # | Issue | Likelihood | Impact | Risk Level |
|---|---|---|---|---|
| F-01 | Public enquiry route uses service-role + no validation + no rate-limit | High | High | **Critical** |
| F-02 | No application-level rate-limiting on any route | High | Medium | **High** |
| F-03 | Database RLS uses blanket `USING (true)` on all business tables | Medium | High | **High** |
| F-04 | Weak password policy (6 chars, no complexity) | Medium | High | **High** |
| F-05 | No HTTP security headers (CSP / HSTS / X-Frame-Options / etc.) | Medium | Medium | **Medium** |
| F-06 | `dangerouslySetInnerHTML` renders admin-controlled email template HTML | Low | High | **Medium** |
| F-07 | SVG uploads accepted into public voucher-assets bucket without sanitisation | Low | Medium | **Medium** |
| F-08 | Hardcoded dev quick-login credentials (`password123`) for real-looking staff emails | Low | High | **Medium** |
| F-09 | `EMAIL_CREDENTIAL_ENCRYPTION_KEY` has no versioning / rotation path | Low | High | **Medium** |
| F-10 | No CSRF protection on state-changing routes (`POST /api/logout`, etc.) | Low | Medium | **Low** |
| F-11 | PostgREST `or()` filter has incomplete special-character escaping | Low | Low | **Low** |
| F-12 | `createServiceClient` validates the service key only with `includes(".")` | Low | Low | **Low** |
| F-13 | `any[]` typed traveller / child-traveller arrays in `/api/enquiries` | Low | Low | **Low** |
| F-14 | `console.error` logs full Supabase error objects (codes/hints) | Low | Low | **Low** |
| F-15 | No `pnpm audit` / dependency vulnerability scan in CI | Low | Low | **Low** |

Ranked most → least severe: **F-01 > F-02 ≈ F-03 ≈ F-04 > F-05 ≈ F-06 ≈ F-07 ≈ F-08 ≈ F-09 > F-10 > F-11 ≈ F-12 ≈ F-13 ≈ F-14 ≈ F-15**.

## 3. Detailed Findings

### F-01 — Public enquiry route bypasses RLS, accepts unvalidated input, no rate-limit

- **Description**: `POST /api/enquiries` is an unauthenticated public route (designed for the booking web form and paste-import). It instantiates `createServiceClient()` (which intentionally bypasses RLS) and writes to `customers`, `bookings`, `booking_suites`, `travellers`, `booking_transport_requests`, `booking_vehicle_rental_details`, `quotes`, `quote_line_items`, and `audit_logs`. The handler reads the request body directly (`const body = await req.json()`) with no Zod schema, no length limits, no `terms_accepted` enforcement, and no captcha or rate-limit. The email lookup path (`customers.select(...).eq("email", normalizedEmail)`) doubles as a customer-enumeration oracle.
- **Affected Area**: `app/api/enquiries/route.ts:301–579`; `lib/supabase/server.ts:45–62`.
- **Likelihood**: High — anyone on the internet can call the endpoint.
- **Impact**: High — unbounded inserts (DoS, storage bloat, audit-log spam), data poisoning of the sales pipeline, customer email enumeration, possible cost amplification via outbound emails triggered downstream.
- **Risk**: **Critical**.
- **Effort**: Medium.
- **Cost Implication**: Medium (Vercel/Supabase request and storage cost, plus engineering time).
- **Scope of Fix**: Cross-cutting (route + a new rate-limit/captcha primitive + Zod schema + audit on service-role usage).
- **Recommended Fix**:
  1. Add a strict Zod schema for the request body (cap string/array lengths; reject unknown keys with `.strict()`).
  2. Put the route behind a captcha (hCaptcha/Turnstile already configurable via `supabase/config.toml`) or a Vercel/Upstash rate-limit keyed by IP + email.
  3. Stop returning customer-existence signal: respond identically whether the customer existed or was created.
  4. Move the writes that don't strictly need to bypass RLS off the service-role client; only escalate for the specific tables/columns that need it. Verify each table individually instead of using one service-role transaction for the whole flow.
  5. Add a server-side check that `terms_accepted` is `true` before insert.

### F-02 — No application-level rate-limiting on any route

- **Description**: A repository-wide search for `rate.?limit`, `RateLimit`, or `x-forwarded-for` returns zero hits. Supabase's `auth.rate_limit` covers sign-in/OTP flows (30 sign-ins / 5 min / IP), but none of the in-app routes (`/api/customers/import`, `/api/voucher/generate`, `/api/payments`, `/api/enquiries`, etc.) are rate-limited.
- **Affected Area**: All routes under `app/api/`.
- **Likelihood**: High.
- **Impact**: Medium — DoS, brute-force on `/api/users/*/password` (admin-only but still abusable post-compromise), bulk-import flooding.
- **Risk**: **High**.
- **Effort**: Medium.
- **Cost Implication**: Low (Upstash free tier or `@vercel/kv` is sufficient).
- **Scope of Fix**: Cross-cutting (single helper imported into every route handler).
- **Recommended Fix**: Add a small `rateLimit(request, { keyBy: "ip" | "user", limit, windowMs })` helper backed by Upstash Redis or `@vercel/kv`. Apply per-IP limits to public routes (`/api/enquiries`, `/login` form submissions) and per-user limits to expensive endpoints (`/api/customers/import`, `/api/voucher/generate`, `/api/audit/export`).

### F-03 — RLS policies on business tables resolve to `USING (true)`

- **Description**: The base schema migration grants every authenticated user full CRUD on `bookings`, `customers`, `quotes`, `quote_line_items`, `invoices`, `payments`, `correspondences`, `documents`, `itineraries`, `travellers`, `booking_suites`, and `audit_logs` (e.g. `CREATE POLICY "biz_select" ON "public"."bookings" FOR SELECT TO "authenticated" USING (true);`). Role checks live only in API handlers — a `readonly` user could call Supabase directly with their JWT and read or mutate everything.
- **Affected Area**: `supabase/migrations/20260308095136_remote_schema.sql:1168–1330`.
- **Likelihood**: Medium — requires an authenticated session, but every staff user has one.
- **Impact**: High — unauthorised reads of PII, financial records, and audit logs; unauthorised writes (deleting bookings, fabricating payments).
- **Risk**: **High**.
- **Effort**: High (RLS rewrites + regression testing of every API path).
- **Cost Implication**: Medium.
- **Scope of Fix**: Cross-cutting (schema + tests).
- **Recommended Fix**: Replace `USING (true)` with role-aware predicates using the existing `public.auth_has_role(...)` function. For example:
  - `bookings` SELECT/UPDATE: `auth_has_role(ARRAY['admin','manager','consultant','readonly'::user_role])`.
  - `bookings` DELETE: `auth_has_role(ARRAY['admin','manager'::user_role])`.
  - `audit_logs` INSERT: continue allowing authenticated, but `UPDATE`/`DELETE` should be admin-only (currently only SELECT/INSERT exist — verify no UPDATE/DELETE policy exists at all so the table is append-only).

### F-04 — Weak password policy (6-char minimum, no complexity)

- **Description**: Password creation (`app/api/users/route.ts:20`) and admin reset (`app/api/users/[userId]/password/route.ts:59`) both enforce only `password.length >= 6`. `supabase/config.toml` mirrors this with `minimum_password_length = 6` and `password_requirements = ""`. Default dev passwords (`password123`) would pass.
- **Affected Area**: `app/api/users/route.ts`, `app/api/users/[userId]/password/route.ts`, `supabase/config.toml:190–193`.
- **Likelihood**: Medium.
- **Impact**: High — credential stuffing, brute force, and account takeover are realistic given no rate limit on `/login` form submissions (F-02 amplifies this).
- **Risk**: **High**.
- **Effort**: Low.
- **Cost Implication**: Low.
- **Scope of Fix**: Localised.
- **Recommended Fix**: Increase to a minimum of 12 characters and set `password_requirements = "lower_upper_letters_digits"` (or stricter) in `supabase/config.toml`, then enforce the same Zod constraint (`.min(12).regex(/[A-Z]/).regex(/[a-z]/).regex(/\d/)`) in both API routes. Optionally check against `haveibeenpwned`'s k-anonymity API on set.

### F-05 — No HTTP security headers configured

- **Description**: `next.config.mjs` exports only `{ images: { unoptimized: true } }`. There is no `async headers()` block, and `vercel.json` does not declare any `headers` either. The browser therefore receives no `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy`.
- **Affected Area**: `next.config.mjs`, `vercel.json`.
- **Likelihood**: Medium.
- **Impact**: Medium — increases blast radius of any XSS (no CSP), enables clickjacking (no X-Frame-Options/CSP frame-ancestors), and exposes downgrade attacks (no HSTS).
- **Risk**: **Medium**.
- **Effort**: Low.
- **Cost Implication**: Low.
- **Scope of Fix**: Localised.
- **Recommended Fix**: Add an `async headers()` block in `next.config.mjs` returning a strict CSP (allow only `'self'`, the Supabase project URL, and the Vercel analytics endpoint), HSTS (`max-age=63072000; includeSubDomains; preload`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a minimal `Permissions-Policy`.

### F-06 — `dangerouslySetInnerHTML` renders admin-supplied email template HTML

- **Description**: `app/app/templates/page.tsx:185` renders the previewed template body verbatim: `<div ... dangerouslySetInnerHTML={{ __html: preview?.bodyHtml || "" }} />`. The `templates` table allows insert/update by `admin` and `manager` roles. A compromised admin/manager session — or a privilege-escalation bug — can plant stored XSS that fires on every admin who previews the template.
- **Affected Area**: `app/app/templates/page.tsx:185`.
- **Likelihood**: Low (requires admin/manager write).
- **Impact**: High (stored XSS in the admin console → session theft, lateral admin compromise).
- **Risk**: **Medium**.
- **Effort**: Low.
- **Cost Implication**: Low.
- **Scope of Fix**: Localised.
- **Recommended Fix**: Sanitize with `DOMPurify` (`isomorphic-dompurify` runs server- and client-side) before rendering. Alternatively, render the preview inside a sandboxed `<iframe sandbox="allow-same-origin">` so any malicious script is denied script execution.

### F-07 — SVG uploads accepted into the public voucher-assets bucket

- **Description**: `app/api/voucher-template/upload/route.ts:9,17,24–27` whitelists `image/svg+xml` and the bucket is `public = true` (`supabase/migrations/20260506130000_voucher_assets_bucket.sql:3–11`). SVG can embed `<script>` and `<foreignObject>`. Although the voucher generator embeds the URL via `<img src=…>` (where script execution is suppressed), an attacker (or compromised admin) who knows the public URL can navigate to it directly, executing JS on the supabase storage origin — useful for cookie theft or token leakage in any browser session sharing that origin.
- **Affected Area**: `app/api/voucher-template/upload/route.ts`, `supabase/migrations/20260506130000_voucher_assets_bucket.sql`.
- **Likelihood**: Low.
- **Impact**: Medium.
- **Risk**: **Medium**.
- **Effort**: Low.
- **Cost Implication**: Low.
- **Scope of Fix**: Localised.
- **Recommended Fix**: Remove `image/svg+xml` from the allowed mime list, or pipe SVG uploads through `dompurify` with `{ USE_PROFILES: { svg: true, svgFilters: true } }` to strip `<script>`, `<foreignObject>`, and `on*` handlers before storing. Serve all storage assets through a path that sets `Content-Disposition: attachment` if SVG must be retained.

### F-08 — Hardcoded dev quick-login credentials matching staff emails

- **Description**: `app/login/page.tsx:16–23` hardcodes real-looking staff emails (`carmen@luxustravel.co.za`, …) and a default password `password123` for the dev quick-login flow. The block is gated by `process.env.NODE_ENV === "development"`, but the strings ship in the public bundle of every dev/preview build. Anyone running the app locally with hosted Supabase credentials in `.env.local` can sign in if the corresponding production user re-used `password123`.
- **Affected Area**: `app/login/page.tsx:14–87`.
- **Likelihood**: Low (requires dev build + a real account reusing the default password).
- **Impact**: High (full staff account takeover).
- **Risk**: **Medium**.
- **Effort**: Low.
- **Cost Implication**: Low.
- **Scope of Fix**: Localised.
- **Recommended Fix**: Drop the hardcoded email list; resolve only from `localStorage` or `NEXT_PUBLIC_DEV_QUICK_LOGIN_*` env vars that must be explicitly set in `.env.local`. Document that the dev password must never be a password used by any production user. Add a server check that refuses to issue tokens to listed emails when `NODE_ENV === "production"`.

### F-09 — IMAP credential encryption key has no rotation path

- **Description**: `lib/inbound-email/crypto.ts:6–14` derives a single AES-256-GCM key by SHA-256-hashing `EMAIL_CREDENTIAL_ENCRYPTION_KEY`. The ciphertext format is `v1:iv:tag:cipher`; there is no `v2` path. If the env var leaks, every stored IMAP password is decryptable, and there is no way to re-encrypt with a new key without code changes.
- **Affected Area**: `lib/inbound-email/crypto.ts`, all `inbound_email_accounts.password_encrypted` rows.
- **Likelihood**: Low.
- **Impact**: High (stored mailbox credentials are extremely valuable — they grant access to historical correspondence with customers).
- **Risk**: **Medium**.
- **Effort**: Medium.
- **Cost Implication**: Low.
- **Scope of Fix**: Localised.
- **Recommended Fix**: Introduce a `EMAIL_CREDENTIAL_ENCRYPTION_KEY_ID` env var (e.g. `2026-05`), persist the key id in the ciphertext prefix, and keep a `Map<id, key>` so old ciphertexts decrypt during rotation. Use a proper KDF (`scrypt`/`argon2id` with a per-deployment salt) instead of raw SHA-256 for the key. Document a rotation procedure.

### F-10 — No CSRF protection on state-changing routes

- **Description**: `POST /api/logout` and other state-changing routes accept the Supabase session cookie without any CSRF token or `Origin` check. Supabase cookies default to `SameSite=Lax`, which mitigates classic form-CSRF but not cross-origin `fetch` from a same-site subdomain or browser-extension origin. The logout impact is mostly nuisance, but `POST /api/users/*/password` (admin-only) and `POST /api/payments` are higher value.
- **Affected Area**: `app/api/logout/route.ts`, all API mutating routes that rely solely on cookie auth.
- **Likelihood**: Low.
- **Impact**: Medium.
- **Risk**: **Low**.
- **Effort**: Low (validate `request.headers.get("origin")` against the deployment URL).
- **Cost Implication**: Low.
- **Scope of Fix**: Cross-cutting (helper used by all mutating routes).
- **Recommended Fix**: Add an `assertSameOrigin(request)` helper that compares `request.headers.get("origin")` against `process.env.NEXT_PUBLIC_APP_ORIGIN`, and call it inside every mutating handler (or wrap them with middleware).

### F-11 — PostgREST `or()` filter has incomplete escaping

- **Description**: `app/api/customers/route.ts:39–42` builds a customer search filter as `` `first_name.ilike.%${escaped}%,...` ``, where `escaped` only replaces `,`, `%`, and `_`. Parentheses, dots, periods, and backslashes are not escaped. While PostgREST's parser is reasonably robust here, the filter can still be made to error or behave unexpectedly with crafted input.
- **Affected Area**: `app/api/customers/route.ts:39–42`.
- **Likelihood**: Low.
- **Impact**: Low.
- **Risk**: **Low**.
- **Effort**: Low.
- **Cost Implication**: Low.
- **Scope of Fix**: Localised.
- **Recommended Fix**: Use the `@supabase/postgrest-js` `or()` builder with parameterised conditions, or whitelist the input to `[A-Za-z0-9 @.\-]` before interpolating. Tests should cover inputs with `)`, `(`, `.`, and `\`.

### F-12 — `createServiceClient` validates the service key only by `.includes(".")`

- **Description**: `lib/supabase/server.ts:54` only checks that the env value contains a `.`. Any non-empty malformed string passes this gate, so a misconfigured deployment can silently use a non-JWT value and only fail at runtime with an obscure error.
- **Affected Area**: `lib/supabase/server.ts:45–62`.
- **Likelihood**: Low.
- **Impact**: Low.
- **Risk**: **Low**.
- **Effort**: Low.
- **Cost Implication**: Low.
- **Scope of Fix**: Localised.
- **Recommended Fix**: Verify the value parses as a JWT with three base64url segments and a `role: "service_role"` claim. Throw at startup, not at first call.

### F-13 — `any[]`-typed traveller arrays in `/api/enquiries`

- **Description**: `app/api/enquiries/route.ts:466–467` types `adultTravellers` and `childTravellers` as `any[]`. Combined with the absence of a Zod schema (F-01), the handler will happily persist arbitrary shapes into `travellers` rows, including unexpected boolean coercions on `prefix`, etc.
- **Affected Area**: `app/api/enquiries/route.ts:454–496`.
- **Likelihood**: Low.
- **Impact**: Low.
- **Risk**: **Low**.
- **Effort**: Low.
- **Cost Implication**: Low.
- **Scope of Fix**: Localised.
- **Recommended Fix**: When fixing F-01, replace `any[]` with a `travellerSchema = z.object({ name: z.string(), surname: z.string(), prefix: z.string().nullable().optional(), idPassport: z.string().nullable().optional(), dateOfBirth: z.string().date().nullable().optional() }).strict()`.

### F-14 — `console.error` logs full Supabase error objects

- **Description**: Routes such as `app/api/customers/import/route.ts:68` and `lib/api/responses.ts:25` log `error.code`, `error.hint`, `error.details`, and `error.message` to stdout. These often disclose schema names, column names, and (in some cases) bits of data referenced by the failing query. Logs typically flow to Vercel + downstream observability sinks.
- **Affected Area**: Many routes (`app/api/customers/import/route.ts`, `app/api/users/route.ts`, `lib/api/responses.ts`, etc.).
- **Likelihood**: Low.
- **Impact**: Low.
- **Risk**: **Low**.
- **Effort**: Low.
- **Cost Implication**: Low.
- **Scope of Fix**: Localised.
- **Recommended Fix**: Log only `error.code` and `error.message` (truncated). Route full diagnostic objects to a structured-logging helper that scrubs sensitive fields and emits at `debug` level so production drops them.

### F-15 — No `pnpm audit` / dependency vulnerability scan in CI

- **Description**: `package.json` exposes `lint`, `test`, `test:ci`, and `test:coverage`, but no `audit` or vulnerability-scan script. `pnpm-lock.yaml` pins versions, so a transitively-vulnerable package can sit indefinitely without anyone noticing.
- **Affected Area**: `package.json`, `.github/` (no workflow exists for audit).
- **Likelihood**: Low.
- **Impact**: Low (latent — depends on whether/when a new CVE lands in the dependency tree).
- **Risk**: **Low**.
- **Effort**: Low.
- **Cost Implication**: Low.
- **Scope of Fix**: Localised.
- **Recommended Fix**: Add `"audit": "pnpm audit --prod --audit-level=high"` to `package.json` and call it from a scheduled GitHub Actions workflow (weekly). Optionally enable GitHub Dependabot alerts at the org level.

## 4. Priority Actions

In order of risk-adjusted value (focus on highest risk × lowest effort first):

1. **F-04 (High risk, Low effort)** — Raise password minimum to 12 chars with complexity, in both `supabase/config.toml` and the two password-handling API routes.
2. **F-01 (Critical risk, Medium effort)** — Add Zod validation, captcha/rate-limit, and a constant-time response to the public enquiry route; constrain its use of the service-role client.
3. **F-02 (High risk, Medium effort)** — Introduce a small rate-limit helper (Upstash / `@vercel/kv`) and wire it into the public, auth, and bulk-import routes.
4. **F-05 (Medium risk, Low effort)** — Add `headers()` in `next.config.mjs` with CSP / HSTS / X-Frame-Options / X-Content-Type-Options / Referrer-Policy.
5. **F-08 (Medium risk, Low effort)** — Remove hardcoded dev quick-login emails/passwords; require explicit env-var or localStorage configuration.
6. **F-06 (Medium risk, Low effort)** — Sanitize email-template HTML preview with DOMPurify or render in a sandboxed iframe.
7. **F-07 (Medium risk, Low effort)** — Drop `image/svg+xml` from the voucher-assets allow-list (or sanitize SVGs server-side).
8. **F-03 (High risk, High effort)** — Plan a follow-up project to replace `USING (true)` business-table policies with role-aware predicates; ship in a single migration with regression tests on every API route.
9. **F-09 (Medium risk, Medium effort)** — Add key-versioning to the IMAP credential encryption and document a rotation procedure.
10. Remaining low-risk items (**F-10 – F-15**) can be batched into a single hardening PR; none are blockers individually.

---

_End of report._
