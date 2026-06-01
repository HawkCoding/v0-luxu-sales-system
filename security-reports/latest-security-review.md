# Luxus Sales System — Security Review

| | |
|---|---|
| **Repository** | hawkcoding/v0-luxu-sales-system |
| **Run date** | 2026-06-01 |
| **Branch reviewed** | `claude/friendly-curie-L6Ra6` (HEAD) |
| **Reviewer** | Automated security-focused code review |
| **Overall security posture** | **Moderate** |
| **Highest-risk issue** | Public `/api/enquiries` POST uses service-role client without Zod validation, authentication, or rate limiting |
| **Lowest-risk issue** | `patchJobSchema.passthrough()` accepts unknown fields in `PATCH /api/jobs/[id]` |
| **Total findings** | 13 |

---

## 1. Summary

Internal-facing CRM with mostly well-formed authentication and Zod-validated routes, but several externally-reachable surfaces have inconsistent defenses. The most serious gaps are an **unauthenticated, unvalidated public POST endpoint that writes through the service role key**, **stored-template HTML rendered with `dangerouslySetInnerHTML`**, and **broad row-level security policies (`USING (true)` for all `authenticated` users)** that put the entire defense on the application layer. No security HTTP response headers are configured. Authentication settings allow signup with passwords as short as 6 characters and MFA is disabled.

Mitigating factors: the app uses parameterized Supabase queries (no string-built SQL), Zod validation on most internal API routes, encrypted IMAP credentials (AES-256-GCM), a CRON_SECRET shared-bearer pattern, signed URLs for storage downloads, and role gates on sensitive actions. RLS is at least enabled on all business tables, so the unauthenticated GETs that don't return 401 are not immediate data-leak vectors.

---

## 2. Risk Matrix

| # | Issue | Likelihood | Impact | Risk Level |
|---|-------|------------|--------|------------|
| 1 | Public `/api/enquiries` POST bypasses RLS, no Zod, no rate limit | High | High | **Critical** |
| 2 | `dangerouslySetInnerHTML` renders stored template `body_html` | High | Medium | **High** |
| 3 | Permissive RLS — `USING (true)` for all `authenticated` users | Medium | High | **High** |
| 4 | Hardcoded `password123` in `supabase/seed.sql` and login defaults | Medium | High | **High** |
| 5 | No security response headers (CSP, HSTS, X-Frame-Options, etc.) | High | Medium | **High** |
| 6 | Open Supabase email signup with 6-char password minimum, no MFA | Medium | High | **High** |
| 7 | `/api/data` and `/api/jobs/[id]` GET return data with no auth gate (defense-in-depth gap) | Medium | Medium | **Medium** |
| 8 | `EMAIL_CREDENTIAL_ENCRYPTION_KEY` derived via single SHA-256 (no per-record salt / KDF) | Low | High | **Medium** |
| 9 | `app/api/audit` POST does `JSON.parse` on caller-supplied strings — fragile error path | Low | Medium | **Low** |
| 10 | Auth callback `next` redirect only checks `startsWith("/")` (no `//` / backslash normalization) | Low | Medium | **Low** |
| 11 | Supabase `max_rows = 1000` and storage `50MiB` defaults: large export / upload exposure | Low | Medium | **Low** |
| 12 | `console.error` of full Supabase errors may leak schema / hints in server logs | Low | Low | **Low** |
| 13 | `patchJobSchema.passthrough()` accepts arbitrary unknown fields | Low | Low | **Low** |

---

## 3. Detailed Findings

### Finding 1 — Public enquiry POST endpoint writes via service-role key without validation
- **Affected area**: `app/api/enquiries/route.ts` lines 410–704
- **Description**: `POST /api/enquiries` is intentionally public (web form + paste import). It calls `createServiceClient()` (RLS-bypass) and writes to `customers`, `bookings`, `booking_suites`, `travellers`, `booking_transport_requests`, `booking_vehicle_rental_details`, `quotes`, `quote_line_items`, and `audit_logs`. The body comes straight from `await req.json()` with **no Zod schema** — the comment `// validated at the Zod boundary above` is misleading; no validation runs. There is no rate-limit, no CAPTCHA, no idempotency token, and no origin check. An attacker can flood the DB with arbitrary customer/booking rows, poison the `audit_logs` table, force unbounded job-number allocation, or supply an `existingCustomerId` to mutate an arbitrary customer (`resolveEnquiryCustomer` updates `customers` by id with no ownership check, line 757–767).
- **Likelihood**: High — endpoint is publicly reachable and clearly enumerable.
- **Impact**: High — data integrity, denial-of-service via storage / row growth, customer-record tampering.
- **Risk**: **Critical**
- **Effort**: Medium
- **Cost implication**: Low (engineering only)
- **Scope of fix**: Localised to one route plus a rate-limiter middleware
- **Recommended fix**:
  1. Add a strict Zod schema that validates every field actually consumed (typed traveller arrays, `transportRequests`, `suiteSelections`, etc.) and reject unknown fields.
  2. Add IP / origin rate limiting (e.g. `@vercel/edge-rate-limit` or a Supabase function) — cap to ~5 enquiries/IP/hour.
  3. Require a CAPTCHA token (hCaptcha / Turnstile) on the public form path and verify server-side. (Supabase config already has placeholders for hCaptcha/Turnstile at `auth.captcha`.)
  4. Reject `existingCustomerId` from public callers; or require it to match the email being submitted.
  5. Drop the service-role client for the GET path — only POST needs it. For the POST, consider doing the write through a `SECURITY DEFINER` Postgres function with an explicit allow-list of fields so the service key never touches user input.

### Finding 2 — Stored template HTML rendered with `dangerouslySetInnerHTML`
- **Affected area**: `app/app/templates/page.tsx:185` (`dangerouslySetInnerHTML={{ __html: preview?.bodyHtml || "" }}`), plus the `templates.body_html` write path in `app/api/templates/route.ts:42`.
- **Description**: Email templates are stored as raw HTML and previewed in-page without sanitization. `PATCH /api/templates` is admin/manager-only, but the GET is `requireUser()` and the template list is read by any authenticated user (`use-data.ts`). The template-preview render is inline (same origin as the app), so any `<script>` in `body_html` executes with the viewer's session cookies — a self-/stored-XSS vector if an admin account is phished or if the seed migrations are altered. Other preview surfaces (`components/preview-and-send-dialog.tsx:113-118`) correctly use an iframe with `sandbox=""`; only the Templates page is unsafe.
- **Likelihood**: High — any admin/manager who edits a template can trigger XSS for themselves and any user who opens the preview.
- **Impact**: Medium — XSS in an admin context can pivot to user-management actions (create user, change roles) via the existing `/api/users` endpoints.
- **Risk**: **High**
- **Effort**: Low
- **Cost implication**: Low
- **Scope of fix**: Localised
- **Recommended fix**: Replace `dangerouslySetInnerHTML` with a sandboxed `<iframe sandbox="" srcDoc={...} />` (matches `preview-and-send-dialog.tsx`). Optionally also sanitize `body_html` on write with `isomorphic-dompurify` and store sanitized HTML — particularly because correspondence email bodies sent via Resend can ingest the same template.

### Finding 3 — Permissive RLS policies (`USING (true)` for authenticated)
- **Affected area**: `supabase/migrations/20260308095136_remote_schema.sql` (baseline policies). E.g. `CREATE POLICY "biz_delete" ON "public"."bookings" FOR DELETE TO "authenticated" USING (true);` — replicated for `customers`, `correspondences`, `documents`, `payments`, `quotes`, `quote_line_items`, `travellers`, `booking_suites`, `audit_logs`, etc.
- **Description**: RLS is enabled but every business-table policy grants full access to anyone in the `authenticated` role. The only meaningful access control is in API code (`requireRole`, `requireManager…`, `clearance_level`). A `readonly` user (created via `createUserSchema` in `app/api/users/route.ts`) becomes a Supabase `authenticated` JWT — they can call PostgREST directly (`/rest/v1/bookings?select=*`, `DELETE /rest/v1/customers?id=eq.<id>`) and bypass every application-layer role gate. Anonymous signup is disabled, but email signup is open (`auth.email.enable_signup = true` in `supabase/config.toml`), so anyone with an email address can register and gain authenticated access.
- **Likelihood**: Medium — requires either an existing user or successful self-signup, but no application bug.
- **Impact**: High — full read / delete on customer, booking, payment, and audit tables.
- **Risk**: **High**
- **Effort**: High
- **Cost implication**: Medium
- **Scope of fix**: Cross-cutting (all RLS policies need to be tightened)
- **Recommended fix**:
  1. Disable email self-signup in `supabase/config.toml` (`auth.email.enable_signup = false`) — users are created through the admin-only `/api/users` route.
  2. Replace `USING (true)` policies with policies keyed on `(SELECT clearance_level FROM profiles WHERE user_id = auth.uid())` or on a custom JWT claim added via the existing `custom_access_token_hook`. Restrict `DELETE` to `admin`/`manager` and writes to non-`readonly` users.
  3. Add an explicit `readonly` policy: `SELECT` only, deny all mutation policies.
  4. Audit `audit_logs` policies — currently any authenticated user can `INSERT` arbitrary rows (`al_insert ... WITH CHECK (true)`).

### Finding 4 — Hardcoded `password123` in seed and login defaults
- **Affected area**: `supabase/seed.sql:26-30`, `app/login/page.tsx:23` (`defaultDevQuickLoginPasswords = ["password123"]`), `qa/lib/auth.ts`, `qa/global-setup.ts`.
- **Description**: `supabase/seed.sql` provisions five named users — `carmen@…`, `leonie@…`, `dirk@…`, `monade@…`, `douwlien@…` — all with bcrypt-hashed `password123`. The login page hardcodes the same password as the default dev quick-login. If `pnpm db:seed:demo` or `pnpm db:reset` is ever run against a hosted environment by accident (the script is gated only by a PowerShell `-ConfirmProduction` flag), every account is takeover-ready. The five real user emails are also leaked in `app/login/page.tsx:17-21`.
- **Likelihood**: Medium — depends on deployment discipline, but the convenience of `db:reset` makes accidents likely.
- **Impact**: High — full app takeover via known credentials.
- **Risk**: **High**
- **Effort**: Low
- **Cost implication**: Low
- **Scope of fix**: Localised
- **Recommended fix**:
  1. Replace seeded passwords with randomly-generated values written only to a local dev log; force a password reset on first sign-in.
  2. Strip the hardcoded e-mail allow-list from `app/login/page.tsx` (it should come from env / localStorage only).
  3. Add a runtime guard in seed scripts: refuse to run if `NEXT_PUBLIC_SUPABASE_URL` does not contain `127.0.0.1` / `localhost`.
  4. Rotate any known-`password123` accounts in dev/staging now.

### Finding 5 — No security response headers
- **Affected area**: `next.config.mjs`, `vercel.json`
- **Description**: `next.config.mjs` only sets `images.unoptimized = true`. There is no `headers()` block, and `vercel.json` has no `headers` array. The app therefore ships without `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy`. Combined with the XSS surface in Finding 2, a `frame-ancestors` directive is the single biggest gap (the app is clickjackable into any third-party iframe).
- **Likelihood**: High — every request lacks these headers.
- **Impact**: Medium — amplifies XSS / clickjacking impact; doesn't enable an attack on its own.
- **Risk**: **High**
- **Effort**: Low
- **Cost implication**: Low
- **Scope of fix**: Localised (single `next.config.mjs` change)
- **Recommended fix**: Add a `headers()` async function in `next.config.mjs` returning:
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `Content-Security-Policy` (start in report-only against the current asset surface — Next 16 + Supabase + Resend)
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`

### Finding 6 — Open Supabase signup, weak password policy, MFA disabled
- **Affected area**: `supabase/config.toml:184-193`, `supabase/config.toml:295-307`
- **Description**:
  - `auth.email.enable_signup = true` — anyone can self-register.
  - `minimum_password_length = 6` and `password_requirements = ""` — single-character classes allowed.
  - `auth.mfa.totp.enroll_enabled = false` and `verify_enabled = false` — MFA is unavailable.
  - `enable_confirmations = false` — emails are not verified before sign-in.
  - This combination means any attacker with an email address can register, hit RLS-permissive endpoints (Finding 3) without verification, and accounts cannot be additionally protected with TOTP.
- **Likelihood**: Medium
- **Impact**: High (compounds Finding 3)
- **Risk**: **High**
- **Effort**: Low
- **Cost implication**: Low
- **Scope of fix**: Localised (`supabase/config.toml`)
- **Recommended fix**:
  - Set `auth.email.enable_signup = false` — provision users through `/api/users`.
  - Raise `minimum_password_length` to 12 and set `password_requirements = "lower_upper_letters_digits_symbols"`.
  - Enable email confirmations.
  - Enable TOTP MFA for staff (`auth.mfa.totp.enroll_enabled = true`, `verify_enabled = true`) and gate manager/admin actions on `aal2`.
  - Configure `auth.captcha` (hCaptcha or Turnstile) on signup and sign-in.

### Finding 7 — `/api/data` and `/api/jobs/[id]` GET return without auth check
- **Affected area**: `app/api/data/route.ts:28-82`, `app/api/jobs/[id]/route.ts:85-95`
- **Description**: Both routes call `createSessionClient()` and proceed without verifying `auth.getUser()` succeeded. `app/api/data/route.ts` deliberately allows `user` to be null and only gates `audit_logs` behind a role check. The fall-back is RLS — which currently does block anonymous reads (`TO authenticated` policies) — but the code does not enforce it. If a future migration ever relaxes a policy (e.g., to support a public landing widget), every customer / booking / payment in the database is one config flip from being public. The same is true of any client that obtains an `anon` key (which is `NEXT_PUBLIC_…` and therefore intentionally exposed).
- **Likelihood**: Medium (configuration drift)
- **Impact**: Medium (PII / financial data)
- **Risk**: **Medium**
- **Effort**: Low
- **Cost implication**: Low
- **Scope of fix**: Localised
- **Recommended fix**: Add the standard `requireUser()` (or at minimum a 401 on missing user) at the top of both handlers; rely on RLS only as defense-in-depth.

### Finding 8 — `EMAIL_CREDENTIAL_ENCRYPTION_KEY` derivation lacks a KDF
- **Affected area**: `lib/inbound-email/crypto.ts:6-14`
- **Description**: The IMAP-password encryption key is derived as `sha256(EMAIL_CREDENTIAL_ENCRYPTION_KEY)`. SHA-256 is not a password-hashing function — if `EMAIL_CREDENTIAL_ENCRYPTION_KEY` is a passphrase rather than 32 raw bytes, brute-force is cheap. Additionally the single global key encrypts every IMAP password; a key compromise reveals every stored credential at once, and there is no key versioning beyond the `v1:` prefix.
- **Likelihood**: Low
- **Impact**: High (loss of all stored mailbox passwords → mailbox compromise)
- **Risk**: **Medium**
- **Effort**: Medium
- **Cost implication**: Low
- **Scope of fix**: Localised, but requires a re-encryption migration
- **Recommended fix**: Require 32 random bytes (base64) for the key, fail closed if `Buffer.from(secret, "base64").length !== 32`; replace `createHash` with `scryptSync(secret, salt, 32)` for passphrase mode. Store a per-record salt or HKDF info. Add `v2:` format with a key-id prefix to allow rotation.

### Finding 9 — `JSON.parse` on caller-supplied strings in `/api/audit` POST
- **Affected area**: `app/api/audit/route.ts:22-25`, `:84-99`
- **Description**: `beforeJson`, `afterJson`, `metaJson` are accepted as JSON-encoded strings and parsed with `JSON.parse` inside the payload build. The try/catch around the assignment masks a parse error, but the parse happens in line 93/94/95 of the assignment object before `payload =` resolves — a `JSON.parse` throw is caught, but if the parsed value is e.g. extremely large or contains `__proto__` it is written verbatim into the `meta_json` jsonb column. No prototype-pollution risk in Postgres jsonb, but the lack of size cap allows large rows.
- **Likelihood**: Low
- **Impact**: Medium
- **Risk**: **Low**
- **Effort**: Low
- **Cost implication**: Low
- **Scope of fix**: Localised
- **Recommended fix**: Accept `metaJson` as `z.record(z.unknown())` (already-parsed JSON) instead of a stringified JSON; cap with `.max()` after `JSON.stringify` of the bound value. Reject objects with `__proto__` / `constructor` keys defensively.

### Finding 10 — Auth-callback `next` redirect only checks `startsWith("/")`
- **Affected area**: `app/auth/callback/route.ts:4-7`
- **Description**: `getSafeNextPath` accepts any string beginning with `/`. Inputs like `//evil.com/foo` or `/\evil.com` may be parsed by some clients as protocol-relative URLs. In current browsers `${origin}//evil.com/foo` resolves under `origin`, but the check is fragile.
- **Likelihood**: Low
- **Impact**: Medium (phishing / token leakage after OAuth)
- **Risk**: **Low**
- **Effort**: Low
- **Cost implication**: Low
- **Scope of fix**: Localised
- **Recommended fix**: Tighten to `rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\")`, or parse with `new URL(rawNext, origin)` and verify `url.origin === origin`.

### Finding 11 — Supabase `max_rows = 1000` and `storage.file_size_limit = 50MiB` (defaults)
- **Affected area**: `supabase/config.toml:18`, `supabase/config.toml:113`
- **Description**: Anonymous / authenticated PostgREST callers can retrieve up to 1000 rows per request — fine for app use, but `/rest/v1/customers?select=*` from an authenticated readonly user (see Finding 3) returns 1000 customer records per call. Global storage limit of 50MiB is high given the application-level `attachment_max_size_mb` default of 10MB — uploads from a privileged user can still reach 50MB.
- **Likelihood**: Low
- **Impact**: Medium
- **Risk**: **Low**
- **Effort**: Low
- **Cost implication**: Low
- **Scope of fix**: Localised
- **Recommended fix**: Drop `max_rows` to 200 for the production schema, or per role using a separate PostgREST role. Lower bucket-level `file_size_limit` to match the highest application setting (10 MiB).

### Finding 12 — `console.error` of full Supabase error objects in server logs
- **Affected area**: `app/api/users/route.ts:154-170`, `app/api/customers/import/route.ts:69`, `app/api/suppliers/[slug]/route.ts:68`, `app/api/suppliers/helpers.ts:166,176,219`, others
- **Description**: Several handlers `console.error("…", { ... message, code, details, hint })`. `details` / `hint` from PostgREST can leak SQL constraints and column names. Combined with the absence of structured logging redaction and Vercel log persistence, these traces are visible to anyone with the Vercel project log scope.
- **Likelihood**: Low
- **Impact**: Low
- **Risk**: **Low**
- **Effort**: Low
- **Cost implication**: Low
- **Scope of fix**: Cross-cutting (multiple files)
- **Recommended fix**: Route Supabase errors through `lib/error-log.ts`'s `logError` (already used elsewhere) which can be configured to scrub `details` / `hint` before persistence. Never include `details` / `hint` in `console.error` strings.

### Finding 13 — `patchJobSchema.passthrough()` allows unknown fields
- **Affected area**: `app/api/jobs/[id]/route.ts:83`
- **Description**: `patchJobSchema` ends with `.passthrough()`, so the Zod-parsed object retains arbitrary unknown keys. The handler explicitly enumerates the keys it consumes, so today nothing extra reaches the DB. The behaviour weakens validation guarantees and makes future regressions easier (e.g., if `updates[snakeKey] = newValue` is generalised).
- **Likelihood**: Low
- **Impact**: Low
- **Risk**: **Low**
- **Effort**: Low
- **Cost implication**: Low
- **Scope of fix**: Localised
- **Recommended fix**: Replace `.passthrough()` with the default strip behaviour; if extra fields must be ignored quietly use `.strict()` and translate the error to a clean 400.

---

## 4. Priority Actions

Highest risk vs lowest effort, in order:

1. **Add Zod + rate limit + CAPTCHA to `/api/enquiries` POST (Finding 1)** — Critical risk, ~half-day fix; the single biggest exposure surface.
2. **Replace `dangerouslySetInnerHTML` in templates preview with a sandboxed iframe (Finding 2)** — High risk, ~30-minute fix matching an existing pattern in the codebase.
3. **Add security response headers in `next.config.mjs` (Finding 5)** — High risk, ~1-hour fix; pairs naturally with Finding 2 (CSP defends if the iframe sandbox is ever loosened).
4. **Disable Supabase email self-signup, raise password minimum, enable MFA (Finding 6)** — High risk, config-only, ~30 minutes.
5. **Rotate `password123` accounts and remove the hardcoded password / e-mail list from `app/login/page.tsx` and `supabase/seed.sql` (Finding 4)** — High risk, ~1 hour.
6. **Add `requireUser()` to `/api/data` and `/api/jobs/[id]` GET (Finding 7)** — Medium risk, ~15-minute fix per route.
7. **Tighten RLS policies — drop `USING (true)` for `readonly` and gate mutations on `clearance_level` via a JWT claim (Finding 3)** — High risk but high effort; plan it as a follow-up migration. Should land before any external-facing user signup is allowed.
8. **Rotate `EMAIL_CREDENTIAL_ENCRYPTION_KEY` and migrate to a per-record salt with HKDF/scrypt (Finding 8)** — Medium risk, ~half-day plus migration.

Followups 9–13 are tracked above and can be addressed in maintenance work; none of them are exploitable in isolation today.
