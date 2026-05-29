# Security Review — Luxus Sales System

| Field | Value |
|---|---|
| Repository | `hawkcoding/v0-luxu-sales-system` |
| Run date | 2026-05-29 |
| Branch reviewed | `claude/friendly-curie-39Wst` |
| App version | `3.07` (`lib/version.ts`) |
| Overall security posture | **Moderate** |
| Total findings | 13 |
| Highest-risk issue | Unauthenticated public POST `/api/enquiries` uses service-role client with no Zod validation, no rate limiting, and no anti-abuse controls |
| Lowest-risk issue | `EMAIL_CREDENTIAL_ENCRYPTION_KEY` uses SHA-256 as a key-derivation function instead of a proper KDF |

---

## 1. Summary

- **13 findings** across application logic, authentication, authorization, input handling, headers, dependency hygiene, and cryptographic patterns.
- The codebase shows clear awareness of Supabase patterns (RLS-aware `createSessionClient` vs. service-role split, AES-256-GCM credential encryption, Zod validation in many routes, audit logging). However, several **defence-in-depth gaps** remain — most notably the public enquiry intake route, missing security headers, and weak password length enforcement.
- **Highest-risk** issue: the public `POST /api/enquiries` route bypasses RLS (service-role) without Zod, rate-limit, CAPTCHA, or body-size limits, allowing unauthenticated abusers to mass-create customers, bookings, draft quotes, and audit log entries.
- **Lowest-risk** issue: the inbound-email encryption key is derived via raw SHA-256 — acceptable with a high-entropy secret, but not best-practice (HKDF/PBKDF2 preferred).
- Overall posture: **Moderate** — exploitable, low-effort issues exist (weak password length, missing security headers, public unvalidated intake) but core RLS/Auth model is sound and most authenticated routes follow good patterns.

---

## 2. Risk Matrix

| # | Issue | Likelihood | Impact | Risk |
|---|---|---|---|---|
| 1 | Public POST `/api/enquiries` — service-role + no Zod + no rate-limit | High | High | **Critical** |
| 2 | No application rate-limiting (login, password reset, public intake, mutations) | High | Medium | **High** |
| 3 | Weak password policy (min length 6) on create + reset | Medium | High | **High** |
| 4 | Missing security headers (CSP, X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy) | High | Medium | **High** |
| 5 | SVG uploads accepted for voucher assets and served via public URL | Medium | Medium | **Medium** |
| 6 | `dangerouslySetInnerHTML` on admin/manager-editable email template HTML | Medium | Medium | **Medium** |
| 7 | `GET /api/data` relies on RLS alone (no explicit 401 when unauthenticated) | Medium | Medium | **Medium** |
| 8 | `CRON_SECRET` compared with `!==` (timing-attack surface) | Low | High | **Medium** |
| 9 | Supabase error messages surfaced verbatim in some routes (info leakage) | Medium | Low | **Low–Medium** |
| 10 | `app/auth/callback` `next` parameter accepted via simple `startsWith("/")` check | Low | Medium | **Low–Medium** |
| 11 | Dev-only quick-login uses default password `password123` with real employee emails | Low | High | **Medium** (dev-only gate) |
| 12 | `any` types and missing schemas around `body.travellers`, `body.transportRequests` in `/api/enquiries` | Medium | Low | **Low–Medium** |
| 13 | `EMAIL_CREDENTIAL_ENCRYPTION_KEY` → key via SHA-256 (no proper KDF) | Low | Low | **Low** |

---

## 3. Detailed Findings

### Finding 1 — Public `POST /api/enquiries` uses service-role client with no validation / rate-limit
- **Description**: `app/api/enquiries/route.ts:410-702` accepts arbitrary JSON, then uses `createServiceClient()` (RLS bypass) to insert `customers`, `bookings`, `quotes`, `quote_line_items`, `booking_suites`, `travellers`, `booking_transport_requests`, `audit_logs`. There is **no Zod schema**, **no rate-limit**, **no CAPTCHA**, **no body-size limit**, and no spam-detection. `body.travellers: any[]` and `body.transportRequests` are processed directly. Adversaries can mass-create records, pollute audit logs, exhaust job-numbering allocations, and store arbitrary blobs in `extracted_json`/`raw_text`.
- **Affected area**: `app/api/enquiries/route.ts:410-702`, `lib/supabase/server.ts:45`, `lib/job-numbering.ts`.
- **Likelihood / Impact / Risk**: High / High / **Critical**
- **Effort estimate**: Medium — add a strict Zod schema, set Next route `bodyParser` size limit, integrate a rate-limit (Upstash / `@vercel/firewall` / IP+email throttle), optionally HMAC-sign requests from the public form, add CAPTCHA for unauthenticated callers.
- **Cost implication**: Low–Medium (rate-limit infra has a small recurring cost).
- **Scope of fix**: Localised to one route, but Zod schemas can be reused across paste-import / web-form flows.
- **Recommended fix**:
  1. Define `enquiryPostSchema` (Zod) covering all `body.*` fields, including `travellers`, `childTravellers`, `transportRequests` (replace `any[]`).
  2. Reject payloads above a hard byte limit (e.g. 256 KB) before parsing.
  3. Apply per-IP and per-email rate-limit (e.g. 5 / minute, 30 / hour).
  4. Require a CAPTCHA token (hCaptcha / Cloudflare Turnstile) for unauthenticated callers; bypass when `sessionClient.auth.getUser()` returns a staff user.
  5. Cap `raw_text` and `extracted_json` size on the server.

---

### Finding 2 — No application-level rate limiting anywhere
- **Description**: `grep` for `rateLimit|throttle` returns zero hits across `app/`, `lib/`. Login (`/login` → `supabase.auth.signInWithPassword`), password reset (`auth-context.tsx:369`), public intake (`/api/enquiries`), document/voucher uploads, and all mutating API routes are unthrottled. Combined with the 6-char password minimum (Finding 3) this enables credential-stuffing and brute force on real staff accounts.
- **Affected area**: All API routes, especially `app/login/page.tsx`, `app/api/enquiries/route.ts`, `app/api/documents/upload/route.ts`, `app/api/users/[userId]/password/route.ts`.
- **Likelihood / Impact / Risk**: High / Medium / **High**
- **Effort estimate**: Medium — introduce a shared rate-limit helper (`lib/rate-limit.ts`) using Upstash Redis or in-Postgres token-bucket.
- **Cost implication**: Low (Upstash free tier covers this scale) – Medium.
- **Scope of fix**: Cross-cutting — best implemented as a wrapper around `requireUser`/`requireRole` and applied to public routes individually.
- **Recommended fix**: Add a per-IP / per-user limiter. Apply it at minimum to: login, password reset, `/api/enquiries POST`, `/api/users POST`, `/api/users/[id]/password POST`, document upload routes.

---

### Finding 3 — Weak password policy (min 6 characters)
- **Description**: `app/api/users/route.ts:20` enforces `password: z.string().min(6)` for new user creation. `app/api/users/[userId]/password/route.ts:59` enforces the same on admin password resets. NIST SP 800-63B requires at least 8 characters; OWASP recommends 8–12 minimum with a deny-list of common passwords. Combined with no rate-limit (Finding 2), 6-character passwords are trivially brute-forceable.
- **Affected area**: `app/api/users/route.ts:20`, `app/api/users/[userId]/password/route.ts:59`.
- **Likelihood / Impact / Risk**: Medium / High / **High**
- **Effort estimate**: Low — change schema and add a deny-list.
- **Cost implication**: Low.
- **Scope of fix**: Localised (two routes + matching client-side validators).
- **Recommended fix**: Raise minimum length to 12, require check against `haveibeenpwned` k-anonymity range (optional), reject the top-1000 common passwords, and mirror client-side validation in `components/salesperson-credentials-settings.tsx` and any password set/reset UIs.

---

### Finding 4 — Missing security HTTP headers
- **Description**: Neither `next.config.mjs`, `vercel.json`, nor `proxy.ts` sets any of `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options` / `frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy`. The app embeds untrusted email HTML inside `<iframe sandbox="">` (good — `components/preview-and-send-dialog.tsx:115`), but without an outer CSP, an XSS sink (Finding 6) becomes app-wide instead of frame-scoped. The `next.config.mjs` is essentially empty (only `images.unoptimized = true`).
- **Affected area**: `next.config.mjs`, optionally `proxy.ts` headers.
- **Likelihood / Impact / Risk**: High / Medium / **High**
- **Effort estimate**: Low — add a `headers()` function in `next.config.mjs`.
- **Cost implication**: Low.
- **Scope of fix**: Localised to config.
- **Recommended fix**: Add in `next.config.mjs`:
  - `Content-Security-Policy: default-src 'self'; img-src 'self' data: https://*.supabase.co; script-src 'self' 'unsafe-inline' https://vercel.live; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co https://vitals.vercel-insights.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self';` (tighten incrementally with nonces).
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - `X-Frame-Options: DENY` (redundant with frame-ancestors but cheap).

---

### Finding 5 — SVG voucher assets uploaded by admins and served via public URL
- **Description**: `app/api/voucher-template/upload/route.ts:9` accepts `image/svg+xml` for both `logo` and `banner` uploads, stored in the `voucher-assets` bucket and exposed via `getPublicUrl(path)` (`route.ts:84`). SVG can contain `<script>` and event handlers; if any consumer renders the asset via `<object>`, `<embed>`, direct navigation, or inlines it, this is stored XSS. Even via `<img src>` it does **not** execute, but the public URL means a victim opening the link directly executes JS in the bucket's origin (which may be a Supabase storage subdomain — limits the blast radius but still exposes the user to phishing).
- **Affected area**: `app/api/voucher-template/upload/route.ts:9-27`, `lib/voucher/*` consumers.
- **Likelihood / Impact / Risk**: Medium / Medium / **Medium**
- **Effort estimate**: Low — drop SVG from the accept list, or sanitise on upload with `DOMPurify`/`svgo` server-side.
- **Cost implication**: Low.
- **Scope of fix**: Localised.
- **Recommended fix**: Remove `image/svg+xml` from accepted MIME types, or pass uploaded SVG through a server-side sanitiser before storing. If SVG must stay, ensure the bucket serves `Content-Security-Policy: sandbox` / `Content-Disposition: attachment` and asset is **never** rendered via `<object>`/`<iframe>`.

---

### Finding 6 — `dangerouslySetInnerHTML` on admin-editable template body
- **Description**: `app/app/templates/page.tsx:185` renders `preview.bodyHtml` via `dangerouslySetInnerHTML`. `app/api/templates/route.ts:42` allows `admin` and `manager` roles to PATCH any template's `body_html` (200 KB cap, no sanitisation). A compromised manager session (or insider) can inject script that runs in any admin's session when previewing. The send-flow correctly sandboxes the iframe (`preview-and-send-dialog.tsx:115`), but the `Template Preview` modal does **not**.
- **Affected area**: `app/app/templates/page.tsx:185`, `app/api/templates/route.ts:42-89`.
- **Likelihood / Impact / Risk**: Medium / Medium / **Medium**
- **Effort estimate**: Low — wrap the preview in the same `<iframe sandbox="" srcDoc={…}>` pattern already used in `preview-and-send-dialog.tsx:113-118`.
- **Cost implication**: Low.
- **Scope of fix**: Localised.
- **Recommended fix**: Render template previews in a sandboxed iframe (mirroring the existing send dialog), and/or sanitise `body_html` server-side with a HTML allow-list before persisting.

---

### Finding 7 — `GET /api/data` does not return 401 when unauthenticated
- **Description**: `app/api/data/route.ts:28-42` calls `supabase.auth.getUser()` but never checks the result before issuing queries. It relies entirely on Supabase RLS to gate every table read (customers, bookings, payments, audit_logs, etc.). If a future RLS policy regression accidentally allows `anon` reads, this endpoint silently leaks an entire CRM dump. Defence-in-depth: explicitly reject unauthenticated callers.
- **Affected area**: `app/api/data/route.ts:28-82`.
- **Likelihood / Impact / Risk**: Medium / Medium (catastrophic if RLS regresses) / **Medium**
- **Effort estimate**: Low — early-return when `!user`.
- **Cost implication**: Low.
- **Scope of fix**: Localised.
- **Recommended fix**: Replace the conditional profile lookup with a `requireUser()` call (already exists in `lib/api/auth.ts:29`) and return 401 immediately when the session is missing.

---

### Finding 8 — `CRON_SECRET` constant-time comparison missing
- **Description**: `app/api/cron/email-sync/route.ts:7`, `cron/payment-reminders/route.ts:8`, `cron/pipeline-auto-close/route.ts:42` use `authHeader !== `Bearer ${process.env.CRON_SECRET}`` which short-circuits and reveals length / prefix information via timing. With a 32-byte random secret this is mostly theoretical, but cheap to fix.
- **Affected area**: Three cron route handlers.
- **Likelihood / Impact / Risk**: Low / High (full unauth cron access) / **Medium**
- **Effort estimate**: Low.
- **Cost implication**: Low.
- **Scope of fix**: Localised (extract a helper).
- **Recommended fix**: Use `crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))` with length-equality guard, centralised in `lib/api/cron-auth.ts`.

---

### Finding 9 — Supabase error details surfaced in API responses
- **Description**: Several routes return `error.message` directly (e.g. `app/api/users/[userId]/route.ts:100,121,218`, `app/api/users/route.ts:91,135`, `app/api/voucher-template/upload/route.ts:81,107`, `cron/pipeline-auto-close/route.ts:58`). These can leak schema names, constraint names, or PostgREST internals to clients. Other routes correctly use `safeSupabaseError` (`lib/api/responses.ts:20`) which logs server-side and returns a generic message — that pattern should be applied uniformly.
- **Affected area**: `app/api/users/**`, `app/api/voucher-template/upload/route.ts`, `app/api/cron/pipeline-auto-close/route.ts`.
- **Likelihood / Impact / Risk**: Medium / Low / **Low–Medium**
- **Effort estimate**: Low.
- **Cost implication**: Low.
- **Scope of fix**: Cross-cutting (several routes) but each fix is local.
- **Recommended fix**: Replace `NextResponse.json({ error: error.message }, …)` with `safeSupabaseError(scope, error)` everywhere; never echo Supabase `message`/`hint`/`details` to the client.

---

### Finding 10 — `auth/callback` `next` redirect accepts any `/`-prefixed path
- **Description**: `app/auth/callback/route.ts:4-7` only checks `rawNext.startsWith("/")`. The final redirect uses `${origin}${next}`, so an attacker-supplied `//evil.com/x` becomes `https://your-site.com//evil.com/x` — a path on your origin (safe in practice today). But `next` is not validated as a same-origin path, so future changes (e.g. switching to `NextResponse.redirect(next, …)` directly) would silently introduce an open-redirect. Tightening now is cheap.
- **Affected area**: `app/auth/callback/route.ts:4-7`.
- **Likelihood / Impact / Risk**: Low / Medium / **Low–Medium**
- **Effort estimate**: Low.
- **Cost implication**: Low.
- **Scope of fix**: Localised.
- **Recommended fix**: Reject `next` values where `next.startsWith("//")` or `next.includes(":")` or that fail `URL` parsing against the request origin. Whitelist known internal paths (`/app`, `/auth/set-new-password`).

---

### Finding 11 — Dev-only quick-login with hard-coded employee emails + `password123`
- **Description**: `app/login/page.tsx:16-23` hard-codes a list of real `luxustravel.co.za` employee emails as `defaultDevQuickLoginEmails` together with a default password `password123` (`line 23`). The block is gated by `process.env.NODE_ENV !== "development"`. Risks: (a) `NEXT_PUBLIC_*` envs are baked into the client bundle — if `NEXT_PUBLIC_DEV_QUICK_LOGIN_*` is ever set in a non-dev build, real credentials ship to production; (b) the defaults match production accounts, so if any environment ever has `password123` for those accounts, the dev tool is also a production attack tool; (c) the employee email list itself is a low-grade information disclosure even in dev builds.
- **Affected area**: `app/login/page.tsx:14-100`, `.env.local.example:22-24`.
- **Likelihood / Impact / Risk**: Low (gated) / High / **Medium**
- **Effort estimate**: Low.
- **Cost implication**: Low.
- **Scope of fix**: Localised.
- **Recommended fix**: Replace the hard-coded employee list with placeholders (e.g. `dev@example.invalid`), strip the block at build time via `process.env.NODE_ENV !== "production"` *and* an `if (typeof window === "undefined")` server-side hard fail, or move the block behind a `if (process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN === "1")` flag that is never set in CI.

---

### Finding 12 — `any` typing + unschema'd nested arrays in `/api/enquiries`
- **Description**: `app/api/enquiries/route.ts:572-598` declares `adultTravellers: any[]` / `childTravellers: any[]` and iterates over `body.transportRequests` without a schema. Combined with Finding 1 (service-role + public), this means attacker-supplied objects can include unexpected fields that flow into `booking_transport_requests`, `travellers`, and `booking_vehicle_rental_details` inserts. The project's `CLAUDE.md` explicitly mandates "Never use `any` unless unavoidable" and "Validate all external input at API boundaries with Zod".
- **Affected area**: `app/api/enquiries/route.ts:561-650`.
- **Likelihood / Impact / Risk**: Medium / Low / **Low–Medium**
- **Effort estimate**: Low–Medium (full schema covers Finding 1 too).
- **Cost implication**: Low.
- **Scope of fix**: Localised (rolls up into Finding 1's fix).
- **Recommended fix**: Replace the `any[]` types with Zod-derived types and `safeParse` the entire body.

---

### Finding 13 — `EMAIL_CREDENTIAL_ENCRYPTION_KEY` derived via plain SHA-256
- **Description**: `lib/inbound-email/crypto.ts:6-14` derives the AES-256-GCM key with `createHash("sha256").update(secret).digest()`. The construction is functionally fine for a high-entropy secret, but it is **not** a KDF — a low-entropy passphrase would be trivially brute-forced offline if an encrypted blob and the salt construction were ever exposed. There is also no associated-data binding, so an attacker who controls the storage layer could swap encrypted credentials across accounts.
- **Affected area**: `lib/inbound-email/crypto.ts:6-14, 16-23, 25-39`.
- **Likelihood / Impact / Risk**: Low / Low / **Low**
- **Effort estimate**: Low–Medium (rotating existing encrypted credentials requires a re-encrypt migration).
- **Cost implication**: Low.
- **Scope of fix**: Localised (with a small migration).
- **Recommended fix**: Use HKDF-SHA256 with a per-record salt, or PBKDF2/scrypt if the secret can be a passphrase. Bind the `account_id` as AES-GCM associated data so cipher-texts cannot be swapped across rows. Provide a re-encryption helper to rotate the existing v1 ciphertexts.

---

## 4. Priority Actions

Ranked by highest-risk × lowest-effort:

1. **Finding 3 — Raise password minimum to 12 chars + deny-list common passwords.** Trivial schema change in two routes; immediately reduces brute-force exposure.
2. **Finding 4 — Add security HTTP headers (CSP, HSTS, X-Content-Type-Options, Referrer-Policy, frame-ancestors).** A single `headers()` block in `next.config.mjs`; provides broad defence-in-depth.
3. **Finding 1 — Lock down `POST /api/enquiries`** with Zod, body-size cap, rate-limit, and CAPTCHA. Highest-risk surface; the public form is the obvious abuse target.
4. **Finding 7 — Add explicit `requireUser` gate to `GET /api/data`.** One-line fix; closes the only authenticated-but-not-checked aggregate read endpoint.
5. **Finding 2 — Introduce a shared `lib/rate-limit.ts` helper** (Upstash or PG token-bucket) and apply to login, password reset, public intake, and admin user mutations.
6. **Finding 6 — Wrap template preview in a sandboxed `<iframe srcDoc>`** to match the existing send dialog pattern.
7. **Finding 8 — Centralise cron auth with `crypto.timingSafeEqual`.**
8. **Finding 5 — Remove SVG from voucher upload accept list** (or sanitise SVG on upload).
9. **Finding 9 — Replace ad-hoc `error.message` returns with `safeSupabaseError`** throughout user/voucher/cron routes.
10. **Finding 11 — Replace hard-coded employee dev-login defaults** with placeholders.
11. **Finding 10 — Tighten `next` query validation** in `auth/callback`.
12. **Finding 12 — Eliminate `any[]` in `/api/enquiries`** (rolls into the Finding 1 schema).
13. **Finding 13 — Move email-credential key derivation to HKDF + GCM AAD** (low risk, plan during next maintenance window).

---
