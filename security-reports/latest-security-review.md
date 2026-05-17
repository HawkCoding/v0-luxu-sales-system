# Luxus Sales System — Security Review

| Field | Value |
|---|---|
| Repository | `HawkCoding/v0-luxu-sales-system` |
| Branch reviewed | `claude/friendly-curie-6ZBC4` |
| Run date | 2026-05-17 |
| Overall security posture | **Moderate** |
| Total findings | 14 |
| Highest-risk issue | Public `/api/enquiries` POST uses service-role client with no validation, auth, CAPTCHA, or rate limiting |
| Lowest-risk issue | Duplicate `nodemailer` versions in lockfile |

---

## 1. Summary

The application takes many of the right structural steps:

- Server-side Supabase clients are clearly separated (`createSessionClient` vs `createServiceClient`) and RLS is `authenticated`-scoped by default.
- Most internal API routes call `requireUser` / `requireRole`, validate input with Zod, and emit consistent error shapes.
- IMAP account passwords are encrypted at rest with AES-256-GCM (`lib/inbound-email/crypto.ts`).
- Dependencies (Next.js 16.1.6, Supabase JS 2.98.0, Zod 3.25.x, nodemailer 8.x) are recent and not currently subject to known critical CVEs.

The largest gaps are at the **public attack surface and at the perimeter**:

- The public enquiries endpoint bypasses RLS with the service role key and accepts almost any JSON shape.
- There is **no rate limiting** anywhere in the application code, and **no security response headers** (no CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy).
- Several internal endpoints (`/api/data`, `/api/jobs/[id]` GET) rely solely on RLS for access control instead of also returning 401 at the API layer — a single misconfigured policy widens blast radius.
- Stored HTML (email templates, correspondence) is rendered into the admin UI through `dangerouslySetInnerHTML` without sanitization, creating an authenticated stored-XSS path.
- Public voucher-assets bucket accepts SVG, which is an active-content format.

None of the findings represent an exploitable unauthenticated path to PII at the time of review, but the public enquiries endpoint should be tightened soon.

## 2. Risk Matrix

| # | Issue | Likelihood | Impact | Risk Level |
|---|---|---|---|---|
| 1 | Public `/api/enquiries` POST: service-role client + no schema/CAPTCHA/rate limit | High | High | **Critical** |
| 2 | Missing security response headers (CSP, HSTS, X-Frame-Options, etc.) | High | Medium | **High** |
| 3 | `dangerouslySetInnerHTML` rendering of admin-editable template/correspondence HTML | Medium | High | **High** |
| 4 | Public `voucher-assets` storage bucket allows SVG (active content) | Medium | Medium | **Medium** |
| 5 | `/api/data` and `/api/jobs/[id]` GET have no explicit 401 — rely entirely on RLS | Medium | Medium | **Medium** |
| 6 | No application-layer rate limiting (login, enquiries, audit export, password reset) | High | Low | **Medium** |
| 7 | Cron-secret comparison not timing-safe (`!==` on `Bearer <secret>`) | Low | Medium | **Medium** |
| 8 | PostgREST `or(...)` filter built from search string with incomplete escaping | Low | Medium | **Medium** |
| 9 | Minimum password length enforced as 6 characters in user-management endpoints | Medium | Medium | **Medium** |
| 10 | Customer-import endpoint leaks Postgres error `details/hint/code` when `NODE_ENV !== "production"` | Medium | Low | **Low** |
| 11 | Dev quick-login defaults (real staff emails, `password123`) hard-coded in client component | Low | Low | **Low** |
| 12 | Stored correspondence `bodyHtml` accepted up to 200 KB with no server-side sanitization | Low | Medium | **Low** |
| 13 | Service-role key validity check is a substring `.includes(".")` — does not validate JWT | Low | Low | **Low** |
| 14 | Duplicate `nodemailer` versions (`8.0.5` and `8.0.7`) resolved in `pnpm-lock.yaml` | Low | Low | **Low** |

## 3. Detailed Findings

### Finding 1 — Public `/api/enquiries` POST: service-role client with no validation, CAPTCHA, or rate limit
- **File / location**: `app/api/enquiries/route.ts:301-579`
- **Description**: The route is the public web-form / paste-import intake. It calls `createServiceClient()` (RLS bypass) and then writes to `customers`, `bookings`, `booking_suites`, `travellers`, `booking_transport_requests`, `booking_vehicle_rental_details`, `quotes`, `quote_line_items`, and `audit_logs` based on fields drilled directly off `body.*` (`body.email`, `body.contactNumber`, `body.travellers`, `body.transportRequests`, `body.extractedJson`, `body.promotionCode`, etc.). There is no Zod schema, no CAPTCHA, no rate limit, no origin check. The whole route runs as service role, so RLS provides no defence. `adultTravellers: any[] = body.travellers || []` and similar `any` collections are iterated and pushed straight into the database.
- **Affected area**: Public attack surface; customer/booking data integrity.
- **Likelihood / Impact / Risk**: High / High / **Critical**
- **Effort estimate**: Medium
- **Cost implication**: Medium
- **Scope of fix**: Localised (this route + a small rate-limit helper).
- **Recommended fix**:
  1. Add a strict Zod schema for the request body and reject unknown keys (`z.object({...}).strict()`); restrict `extractedJson` to a known shape, reject arbitrary JSON.
  2. Add per-IP rate limiting (e.g. Upstash / Vercel KV / `@vercel/kv` token bucket) — start at 5 req/min per IP and 50 req/day per email.
  3. Add a CAPTCHA (Turnstile / hCaptcha) for the public web form path; require a verified challenge token in the request before any DB write.
  4. Cap traveller/transport-request array sizes (e.g. ≤20 travellers, ≤10 transport requests).
  5. Consider whether the paste-import variant still needs the service role at all — it is triggered by authenticated consultants and could use `createSessionClient()` instead, keeping service-role usage only for the truly public web form.

### Finding 2 — Missing security response headers
- **File / location**: `next.config.mjs` (no `async headers()` block); `vercel.json` (no `headers` array).
- **Description**: The app sets no `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy`. Without CSP, any successful stored-XSS (see Finding 3) can exfiltrate `sb-*` cookies and PII. Without HSTS, a downgrade attack on an unprotected subdomain remains possible. Without `X-Frame-Options: DENY` / `frame-ancestors`, the app can be embedded in clickjacking iframes.
- **Affected area**: Whole-app browser security.
- **Likelihood / Impact / Risk**: High / Medium / **High**
- **Effort estimate**: Low
- **Cost implication**: Low
- **Scope of fix**: Localised (`next.config.mjs`).
- **Recommended fix**: Add an `async headers()` block returning at minimum:
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY` (or `Content-Security-Policy: frame-ancestors 'none'`)
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - A starter `Content-Security-Policy` — `default-src 'self'; img-src 'self' data: <supabase-domain>; connect-src 'self' <supabase-domain> https://api.resend.com; style-src 'self' 'unsafe-inline'; script-src 'self'` — and tighten over time.

### Finding 3 — `dangerouslySetInnerHTML` on admin-editable HTML
- **File / location**: `app/app/templates/page.tsx:185`; pattern repeats wherever correspondence `body_html` is rendered. The HTML originates from `templates.body_html` (admin/manager-edited) and `correspondences.body_html` (consultant-sent, persisted with no sanitization in `app/api/correspondence/route.ts:106`).
- **Description**: Stored HTML is rendered straight into the staff DOM with no DOMPurify/sanitizer. An admin/manager who edits a template (or a successfully-imported inbound email body) can craft a payload that executes JavaScript when a colleague previews it — and from there harvest other users' Supabase session cookies (no CSP, no `httpOnly`-only assumption, see Finding 2).
- **Affected area**: Staff console / templates / correspondence preview.
- **Likelihood / Impact / Risk**: Medium / High / **High**
- **Effort estimate**: Medium
- **Cost implication**: Low
- **Scope of fix**: Cross-cutting (each `dangerouslySetInnerHTML` site).
- **Recommended fix**:
  1. Add `isomorphic-dompurify` (or `dompurify` server-side with `jsdom`) and run every template/correspondence body through it before render.
  2. Where possible, render template previews inside a sandboxed `<iframe sandbox>` to remove ambient script capability entirely.
  3. Pair with the CSP from Finding 2 to make inline-script execution impossible even on a regression.

### Finding 4 — Public `voucher-assets` bucket accepts SVG
- **File / location**: `supabase/migrations/20260506130000_voucher_assets_bucket.sql:9` (`allowed_mime_types ... 'image/svg+xml'` + `public = true`); upload code `app/api/voucher-template/upload/route.ts:9`.
- **Description**: `voucher-assets` is a `public` Supabase bucket and accepts SVG. SVG can carry inline `<script>` / event handlers; the public URL (`logo.svg`, `banner.svg`) is then embedded in voucher HTML/email and could be opened directly in browser tabs. The upload endpoint restricts writes to admins, so the exposure is admin-on-admin or admin-on-customer, but the format is active content rendered in a privileged session.
- **Affected area**: Voucher rendering, public storage.
- **Likelihood / Impact / Risk**: Medium / Medium / **Medium**
- **Effort estimate**: Low
- **Cost implication**: Low
- **Scope of fix**: Localised (migration + upload validator).
- **Recommended fix**: Drop `image/svg+xml` from `allowed_mime_types` and from `CROPPED_MIME_BY_KIND`/`EXTENSION_BY_MIME`. If SVG is required, sanitize uploads with `svgo`/`DOMPurify` server-side and serve them with `Content-Security-Policy: sandbox`.

### Finding 5 — `/api/data` and `/api/jobs/[id]` GET have no explicit auth gate
- **File / location**: `app/api/data/route.ts:27-42`; `app/api/jobs/[id]/route.ts:77-86`.
- **Description**: Both routes call `createSessionClient()` and immediately query large tables without first returning 401 for missing users. They rely on RLS to filter rows. That is correct in steady state, but a single regression in a policy (e.g. a `to public USING (true)` policy added later) leaks the whole dataset to an unauthenticated caller. The defensive control is cheap — call `supabase.auth.getUser()` and return 401 immediately when no user.
- **Affected area**: Internal-data API.
- **Likelihood / Impact / Risk**: Medium / Medium / **Medium**
- **Effort estimate**: Low
- **Cost implication**: Low
- **Scope of fix**: Localised.
- **Recommended fix**: Replace the optional-user pattern with `requireUser()` from `lib/api/auth.ts` — same shape used by `/api/pipeline` — and remove the `user ? ... : { data: null }` fallback.

### Finding 6 — No rate limiting on any endpoint
- **File / location**: All API routes; particularly `app/api/enquiries/route.ts`, `app/login/page.tsx` (login), `app/api/users/[userId]/password/route.ts`, `app/api/audit/export/route.ts`.
- **Description**: Login, password reset, public enquiry creation, and the 10 000-row audit CSV export have no application-layer throttling. Supabase Auth has its own rate limits, but they do not cover the local endpoints (e.g. enquiries, audit export). An attacker can DoS the database via enquiries POST cheaply, or scrape audit logs.
- **Affected area**: Whole app.
- **Likelihood / Impact / Risk**: High / Low / **Medium**
- **Effort estimate**: Medium
- **Cost implication**: Low–Medium (KV/Redis cost).
- **Scope of fix**: Cross-cutting (introduce a `lib/rate-limit.ts` and call from the highest-traffic routes).
- **Recommended fix**: Add a token-bucket helper (e.g. Upstash Redis or Vercel KV). Apply per-IP limits to public/unauthenticated routes and per-user limits to authenticated ones. Tighten audit export to a per-user concurrency of 1 and a 5-export/hour cap.

### Finding 7 — Cron-secret comparison is not timing-safe
- **File / location**: `app/api/cron/email-sync/route.ts:7`; `app/api/cron/pipeline-auto-close/route.ts:42`.
- **Description**: `authHeader !== \`Bearer ${process.env.CRON_SECRET}\`` short-circuits on the first byte mismatch. In a typical Node deployment the timing differential is small but real, especially behind a CDN that exposes upstream-response timing. The cron secret is long-lived and high-value.
- **Affected area**: Cron endpoints.
- **Likelihood / Impact / Risk**: Low / Medium / **Medium**
- **Effort estimate**: Low
- **Cost implication**: Low
- **Scope of fix**: Localised.
- **Recommended fix**: Use `crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from('Bearer ' + process.env.CRON_SECRET))` with a length pre-check, or compare hashes of both sides.

### Finding 8 — PostgREST `or(...)` filter built from partly-escaped user string
- **File / location**: `app/api/customers/route.ts:39-42`.
- **Description**: `query.replaceAll(",", " ").replaceAll("%", "\\%").replaceAll("_", "\\_")` does not escape `)` `(` `:` `\` or `*`. PostgREST `or` filters are parsed positionally, and unescaped `)` or `:` could re-shape the filter (e.g. close the `or` group and start an `and` group). Auth + RLS limit blast radius to data the calling user is already allowed to see, so this is an injection that *narrows or widens the rows returned within the user's permitted set*, not a true authentication bypass.
- **Affected area**: Customer search.
- **Likelihood / Impact / Risk**: Low / Medium / **Medium**
- **Effort estimate**: Low
- **Cost implication**: Low
- **Scope of fix**: Localised.
- **Recommended fix**: Either (a) strip every character that is not `[a-zA-Z0-9@._\- ]` from the query before interpolating, or (b) issue separate `.ilike()` calls per column and union the IDs in JS, or (c) call a SQL function with parameterised input via `supabase.rpc()`.

### Finding 9 — Minimum password length is 6 characters
- **File / location**: `app/api/users/route.ts:20` (`createUserSchema.password = z.string().min(6)`); `app/api/users/[userId]/password/route.ts:58-63`.
- **Description**: Administrators can set or rotate any user's password to a 6-character string. Combined with the lack of MFA at this layer, this is well below modern guidance (NIST SP 800-63B / OWASP ASVS recommends ≥ 12).
- **Affected area**: User-management endpoints.
- **Likelihood / Impact / Risk**: Medium / Medium / **Medium**
- **Effort estimate**: Low
- **Cost implication**: Low
- **Scope of fix**: Localised.
- **Recommended fix**: Bump `.min(6)` to `.min(12)` and add a check that the password is not contained in the user's email/name; consider integrating zxcvbn for strength feedback at the UI layer. Document the change in `NOTES.md`.

### Finding 10 — Customer-import endpoint leaks Postgres error metadata in non-prod
- **File / location**: `app/api/customers/import/route.ts:65-89`.
- **Description**: `localDiagnosticsEnabled = process.env.NODE_ENV !== "production"` causes responses to embed `details`, `code`, `hint`, and `phase`. Preview environments that fail to set `NODE_ENV=production` will leak schema details (table names, constraints) on import errors.
- **Affected area**: Customer import.
- **Likelihood / Impact / Risk**: Medium / Low / **Low**
- **Effort estimate**: Low
- **Cost implication**: Low
- **Scope of fix**: Localised.
- **Recommended fix**: Gate on an explicit `DIAGNOSTICS_ENABLED` env var (or `process.env.VERCEL_ENV === "development"`) rather than the absence of `production`. Always send the `traceId` to the client and look up details server-side from logs.

### Finding 11 — Dev quick-login defaults hard-coded in the login page bundle
- **File / location**: `app/login/page.tsx:14-23`.
- **Description**: `defaultDevQuickLoginEmails` lists five real Luxus staff email addresses, and `defaultDevQuickLoginPasswords` is `["password123"]`. Even though `canUseDevQuickLogin` is gated on `process.env.NODE_ENV === "development"` and Next.js will dead-code-eliminate the branch in a production build, the literal arrays still sit in `git` and any non-production deployment (preview, staging) will ship the button and the passwords. Real customer emails should not be defaults.
- **Affected area**: Login page.
- **Likelihood / Impact / Risk**: Low / Low / **Low**
- **Effort estimate**: Low
- **Cost implication**: Low
- **Scope of fix**: Localised.
- **Recommended fix**: Replace the hard-coded arrays with empty defaults and require staff to set `NEXT_PUBLIC_DEV_QUICK_LOGIN_EMAIL` / `_PASSWORDS` (or the localStorage overrides) locally. Rotate any password matching `password123` on the local Supabase seed.

### Finding 12 — Correspondence `body_html` accepted at 200 KB with no server-side sanitization
- **File / location**: `app/api/correspondence/route.ts:48-66, 106-119, 124-141`.
- **Description**: Any consultant can POST a `bodyHtml` up to 200 000 characters, which is stored and emailed verbatim. The email recipient's client provides defence-in-depth, but the same `body_html` is later rendered in the admin UI (see Finding 3) and is the seed for the stored-XSS path. Also gives a spammer with a stolen consultant session a high-fidelity phishing primitive.
- **Affected area**: Correspondence storage / emails.
- **Likelihood / Impact / Risk**: Low / Medium / **Low**
- **Effort estimate**: Medium
- **Cost implication**: Low
- **Scope of fix**: Localised.
- **Recommended fix**: Sanitize `bodyHtml` server-side with DOMPurify (allow a small tag/attribute allowlist for branding) before storage and before sending. Reduce the cap to ~50 KB.

### Finding 13 — Service-role key sanity check is a substring `.includes(".")`
- **File / location**: `lib/supabase/server.ts:54-58`.
- **Description**: The guard rejects keys that contain no `.` characters but does not actually verify a JWT. A typo'd or partial value containing a `.` will pass the check and reach Supabase, then fail authentication at runtime with a less obvious error.
- **Affected area**: Server bootstrap.
- **Likelihood / Impact / Risk**: Low / Low / **Low**
- **Effort estimate**: Low
- **Cost implication**: Low
- **Scope of fix**: Localised.
- **Recommended fix**: Validate the structure by counting `.` segments (`split(".").length === 3`) and base64-decoding the header to check `{"alg":"HS256","typ":"JWT"}`. Fail fast at module load.

### Finding 14 — Duplicate `nodemailer` versions resolved in `pnpm-lock.yaml`
- **File / location**: `pnpm-lock.yaml` (entries `nodemailer@8.0.5` and `nodemailer@8.0.7`).
- **Description**: Two versions are installed (one transitive, one direct). Neither is currently subject to a critical CVE, but supply-chain hygiene benefits from deduping. The transitive 8.0.5 likely comes via `@react-email/render` or similar.
- **Affected area**: Dependencies.
- **Likelihood / Impact / Risk**: Low / Low / **Low**
- **Effort estimate**: Low
- **Cost implication**: Low
- **Scope of fix**: Localised.
- **Recommended fix**: Add a `pnpm.overrides` entry pinning `nodemailer` to `8.0.7` and rerun `pnpm install` to dedupe. Run `pnpm audit --prod` as part of CI.

## 4. Priority Actions

Tackle in this order for the best risk-reduction per hour:

1. **Finding 1 — Lock down `/api/enquiries`.** Add Zod, cap array sizes, add per-IP rate limit and CAPTCHA, and move the consultant paste-import path to the session client. *(High risk reduction, medium effort.)*
2. **Finding 2 — Ship security headers** (`next.config.mjs` `headers()` block with HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and a starter CSP). *(High risk reduction, low effort.)*
3. **Finding 3 — Sanitize stored HTML** with DOMPurify before any `dangerouslySetInnerHTML` and before correspondence storage; isolate template previews in a sandboxed iframe. *(High risk reduction, medium effort.)*
4. **Finding 4 — Drop SVG from `voucher-assets`** allowed MIME types. *(Medium risk reduction, low effort.)*
5. **Finding 5 — Add explicit 401 gates** to `/api/data` and `/api/jobs/[id]` GET via `requireUser()`. *(Defence-in-depth, low effort.)*
6. **Finding 7 — Switch cron secret comparison** to `crypto.timingSafeEqual`. *(Easy win.)*
7. **Finding 9 — Raise minimum password to 12** in the user-management endpoints. *(Easy win.)*
8. Address the remaining findings (6, 8, 10–14) as part of the next maintenance pass.

---

*Generated by an automated security review on 2026-05-17. This is a static review; dynamic testing (auth fuzzing, RLS policy diffing, dependency-aware fuzzing) is recommended as a follow-up.*
