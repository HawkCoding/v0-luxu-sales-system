# Security Review — Luxus Sales System

| Field | Value |
| --- | --- |
| **Repository** | hawkcoding/v0-luxu-sales-system |
| **Branch reviewed** | `claude/friendly-curie-IRrZy` |
| **Run date** | 2026-05-10 |
| **Total findings** | 14 |
| **Overall security posture** | **Moderate** |
| **Highest-risk issue** | Permissive RLS policies (`USING (true)`) on all business tables — authenticated users can bypass app-layer role checks via direct PostgREST access |
| **Lowest-risk issue** | `voucher-assets` Supabase Storage bucket is public (intended, but worth confirming) |

> Scope: static review of the working tree at `/home/user/v0-luxu-sales-system`. Live Supabase/Vercel configuration was not inspected and may differ from the committed `supabase/config.toml`.

---

## 1. Summary

- **Total vulnerabilities / weaknesses identified:** 14
- **Highest-risk issue:** Permissive Row Level Security policies on every business table (`customers`, `bookings`, `quotes`, `quote_line_items`, `payments`, `documents`, `correspondences`, `audit_logs`, `travellers`, `itineraries`, `booking_suites`). Each `biz_*` policy is `USING (true) WITH CHECK (true)` for the `authenticated` role, so any signed-in user can read/write any record by bypassing the API and calling Supabase REST directly with their session JWT. Application role checks (`requireRole`) become advisory rather than enforced.
- **Lowest-risk issue:** The `voucher-assets` storage bucket is configured `public = true` (`supabase/config.toml:121–124`). Acceptable for logos/banners, but no access control means a leaked path is world-readable.
- **Overall posture:** **Moderate.** Authentication, secrets isolation, Zod validation coverage, and AES‑256‑GCM credential encryption are all solid. Authorization, however, depends entirely on application-layer checks because RLS is functionally permissive and several public/admin endpoints have gaps (input validation on `/api/enquiries`, missing rate limits, missing security headers, and weak password floor).

---

## 2. Risk Matrix

| # | Issue | Likelihood | Impact | Risk Level |
|---|-------|------------|--------|------------|
| 1 | Permissive RLS (`USING (true)`) on business tables — broken authorization at DB layer | High | High | **Critical** |
| 2 | Public, unauthenticated `/api/enquiries` POST uses `service_role` and lacks Zod validation, rate limiting, and CAPTCHA | High | High | **High** |
| 3 | Self-service Supabase Auth signup enabled (`enable_signup = true`, `enable_confirmations = false`) — combined with #1, anyone can become an authenticated user | Medium | High | **High** |
| 4 | Missing security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy) | High | Medium | **High** |
| 5 | Weak password minimum length (6 characters) in app and Supabase config | Medium | Medium | **Medium** |
| 6 | `dangerouslySetInnerHTML` renders email-template body HTML in admin UI — stored XSS sink | Low | High | **Medium** |
| 7 | Supabase error messages (`error.message`) returned to clients in many routes — info leakage | High | Low | **Medium** |
| 8 | No rate limiting on app endpoints (login, password reset, enquiries, search) | Medium | Medium | **Medium** |
| 9 | Several authenticated route handlers (e.g. `GET /api/jobs/[id]`) skip explicit `auth.getUser()` and rely on RLS — fragile and amplified by #1 (BOLA) | Medium | Medium | **Medium** |
| 10 | Cron handlers compare `Authorization` header with `!==`, not constant-time | Low | Low | **Low** |
| 11 | Dev quick-login hard-codes production-style emails with `password123`, gated only by `NODE_ENV === "development"` | Low | Medium | **Low** |
| 12 | `CRON_SECRET` and `EMAIL_CREDENTIAL_ENCRYPTION_KEY` are not documented in `.env.local.example` — risk of weak / missing values in deployments | Medium | Low | **Low** |
| 13 | `.env.sync.local.example` ships concrete dev/prod Supabase project refs and pooler hostname | Low | Low | **Low** |
| 14 | `voucher-assets` storage bucket is `public = true` | Low | Low | **Low** |

---

## 3. Detailed Findings

### Finding 1 — Permissive RLS policies on business tables (Critical)

- **Description:** Every `biz_*` and `al_*` policy in the base schema grants unconditional access to the `authenticated` role: `USING (true)` for SELECT/DELETE and `USING (true) WITH CHECK (true)` for UPDATE/INSERT. RLS is "enabled" but provides no per-row authorization. An authenticated salesperson (or any user that has obtained a valid session JWT — see Finding 3) can read or modify every customer, booking, quote, payment, traveller record, audit log entry, etc., by bypassing the Next.js API and hitting Supabase PostgREST directly. The application-layer `requireRole(...)` checks are therefore advisory, not enforced.
- **Affected area:** `supabase/migrations/20260308095136_remote_schema.sql:1168–1335` (audit_logs, booking_suites, bookings, correspondences, customers, documents, itineraries, payments, quote_line_items, quotes, travellers).
- **Likelihood / Impact / Risk:** High / High / **Critical**
- **Effort estimate:** **High** — requires designing per-role / per-owner predicates (e.g. `auth_has_role(...)` helper plus `owner_user_id = auth.uid()` style checks) and updating every API route that depends on broad reads.
- **Cost implication:** **High** (touches the data model, every reader/writer, and tests).
- **Scope of fix:** Cross-cutting (database + many API routes + tests).
- **Recommended fix:** Replace blanket `USING (true)` with role-aware predicates that mirror the application logic. For example: `USING (auth_has_role(ARRAY['admin','manager'])) OR owner_user_id = auth.uid() OR assigned_salesperson_id = auth.uid()`. Restrict `audit_logs` SELECT to `admin/manager` only. Add regression tests under `supabase/seed.test.ts` that prove a `consultant` JWT cannot read another consultant's bookings.

---

### Finding 2 — Public `/api/enquiries` POST uses service role with no validation or rate limiting (High)

- **Description:** `app/api/enquiries/route.ts` accepts a JSON body from any unauthenticated caller, instantiates a `createServiceClient()` (RLS-bypassing) and inserts directly into `customers`, `bookings`, `booking_suites`, `travellers`, `booking_transport_requests`, `quotes`, `quote_line_items`, and `audit_logs`. The body is dereferenced field-by-field (`body.email`, `body.travellers`, `body.transportRequests`, `body.extractedJson`, …) without a Zod schema, length caps, type narrowing, or rate limiting. There is also no CAPTCHA. An attacker can mass-create customers/bookings, set arbitrary `extracted_json`, force `terms_accepted = true`, push junk into `audit_logs`, drive Supabase costs up, and pollute the salesperson queue.
- **Affected area:** `app/api/enquiries/route.ts:225–479`.
- **Likelihood / Impact / Risk:** High / High / **High**
- **Effort estimate:** **Medium** — add Zod schema, length caps, IP-based rate limit (Vercel KV / Upstash / @upstash/ratelimit), optional Turnstile/hCaptcha, and bound array sizes (`travellers`, `transportRequests`).
- **Cost implication:** Low–Medium (single route + reusable rate limiter).
- **Scope of fix:** Localised to one route plus a shared rate-limit helper.
- **Recommended fix:** Define a strict Zod schema (mirroring the public form's contract), reject extra fields (`.strict()`), cap array lengths, drop or sanitise `rawText`/`extractedJson`, and gate the route with rate limiting + CAPTCHA. Audit logs from this route should set a fixed `actor: "public_intake"` rather than letting the caller influence them.

---

### Finding 3 — Self-service signup enabled in Supabase config (High)

- **Description:** `supabase/config.toml` has `enable_signup = true` (lines 184, 219), `enable_confirmations = false` (line 224), `enable_anonymous_sign_ins = false` (good), and no captcha. If the hosted project mirrors this, anyone can hit Supabase's `/auth/v1/signup` endpoint and obtain a valid `authenticated` JWT, which — combined with Finding 1 — grants them read/write across the entire business dataset. The application's profile lookup in `app/app/layout.tsx` would block them from the admin UI, but it would not stop direct PostgREST queries.
- **Affected area:** `supabase/config.toml:184, 190, 219, 224`.
- **Likelihood / Impact / Risk:** Medium / High / **High** (depends on hosted-project setting).
- **Effort estimate:** **Low** (toggle settings) once Finding 1 is fixed.
- **Cost implication:** Low.
- **Scope of fix:** Localised (Supabase config + dashboard).
- **Recommended fix:** Set `enable_signup = false` for both `[auth]` and `[auth.email]`, since user creation is administered via `/api/users`. Verify the hosted project (dashboard → Authentication → Providers/Settings) matches. If self-service signup is ever needed, enable email confirmation and CAPTCHA.

---

### Finding 4 — No security headers (HSTS, CSP, X-Frame-Options, etc.) (High)

- **Description:** `next.config.mjs` only sets `images.unoptimized: true`. There is no `headers()` block, no Vercel `headers` config (`vercel.json` only declares cron jobs), and no `middleware.ts`/`proxy.ts` header injection. Browsers receive no Content-Security-Policy, Strict-Transport-Security, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, or Permissions-Policy. This makes the app vulnerable to clickjacking, MIME-sniffing, mixed content, and broad XSS impact (no CSP fallback for the `dangerouslySetInnerHTML` sink in Finding 6).
- **Affected area:** `next.config.mjs:1–8`, `vercel.json:1–17`, `proxy.ts:80–85`.
- **Likelihood / Impact / Risk:** High / Medium / **High**
- **Effort estimate:** **Low**.
- **Cost implication:** Low.
- **Scope of fix:** Localised (`next.config.mjs` `async headers()` or extend `proxy.ts`).
- **Recommended fix:** Add `headers()` returning at minimum: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and a CSP that allows only `'self'`, the Supabase project URL, Resend/Mailpit, Vercel Analytics, and Google Fonts. Test the CSP first in `Content-Security-Policy-Report-Only`.

---

### Finding 5 — Weak password minimum length (Medium)

- **Description:** `app/api/users/[userId]/password/route.ts:59` enforces only `length >= 6`; `supabase/config.toml:190` sets `minimum_password_length = 6` and `password_requirements = ""`. NIST SP 800-63B and OWASP ASVS recommend ≥ 8, ideally ≥ 12, with breached-password screening.
- **Affected area:** `app/api/users/[userId]/password/route.ts:58–63`, `supabase/config.toml:189–193`.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**
- **Effort estimate:** **Low**.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Raise the minimum to 12 in both places, set `password_requirements = "lower_upper_letters_digits"` (or stronger), and surface the requirement in the admin password-reset UI.

---

### Finding 6 — `dangerouslySetInnerHTML` on email template body in admin UI (Medium)

- **Description:** `app/app/templates/page.tsx:185` renders `preview?.bodyHtml` via `dangerouslySetInnerHTML`. Templates are stored in Postgres and edited by admin/manager roles. Lacking a CSP (Finding 4), an attacker who lands a payload into a template (compromised admin, pricing import, future migration that copies user-supplied HTML, etc.) gets full DOM access in the admin's browser and can pivot through any other app feature.
- **Affected area:** `app/app/templates/page.tsx:185`.
- **Likelihood / Impact / Risk:** Low / High / **Medium**
- **Effort estimate:** **Low–Medium**.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Sanitise with DOMPurify before insertion, or render the preview inside a sandboxed `<iframe srcDoc>` with `sandbox="allow-same-origin"` removed. Add a strict CSP (Finding 4) as defence in depth. Same fix applies to anywhere else `bodyHtml` is rendered to authenticated staff (audit other call sites).

---

### Finding 7 — Supabase error messages leaked to clients (Medium)

- **Description:** Many routes return `{ error: error.message }` from Supabase directly, exposing internal table/column names, constraint names, and PostgREST hints. Examples: `app/api/jobs/[id]/route.ts:544,556,574,597,611,724,773`; `app/api/voucher-template/upload/route.ts:81,107`; `app/api/audit/route.ts:107`; `app/api/settings/deposit/route.ts:61,92`; `app/api/voucher-template/route.ts:77`. The customer import route additionally returns full error details when `NODE_ENV !== "production"` (`app/api/customers/import/route.ts:65–87`); ensure production deployments truly set `NODE_ENV=production`.
- **Affected area:** Multiple API routes (see above).
- **Likelihood / Impact / Risk:** High / Low / **Medium**
- **Effort estimate:** **Low**.
- **Cost implication:** Low.
- **Scope of fix:** Cross-cutting (many handlers, but mechanical).
- **Recommended fix:** Standardise on the existing `safeSupabaseError()` helper from `lib/api/responses.ts` (already used in newer routes like `correspondence` and `inbound-email`). It logs full detail server-side and returns a generic message to the client. Sweep the listed files and replace ad-hoc `error.message` returns.

---

### Finding 8 — No rate limiting on auth or API endpoints (Medium)

- **Description:** No rate limiter is wired into Next.js routes. Login, password reset (`requestPasswordReset`), `/api/enquiries`, customer search (`/api/customers?query=`), and admin password reset (`/api/users/[userId]/password`) are all uncapped. Supabase's built-in auth rate limits (`supabase/config.toml:195–209`) help with `sign_in_sign_ups` and `token_verifications`, but app-layer endpoints get no protection. Combined with Finding 5 (weak passwords), this enables credential stuffing.
- **Affected area:** App-wide; entry points include `app/login/page.tsx`, `app/api/enquiries/route.ts`, `app/api/customers/route.ts`, `app/api/users/[userId]/password/route.ts`.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**
- **Effort estimate:** **Medium**.
- **Cost implication:** Low–Medium (Vercel KV / Upstash plan).
- **Scope of fix:** Cross-cutting (shared helper).
- **Recommended fix:** Add a thin `withRateLimit(req, key)` wrapper backed by Upstash or Vercel KV, applied first in public/auth routes. Configure tight per-IP and per-account limits on login and password-reset; per-IP and per-email limits on `/api/enquiries`.

---

### Finding 9 — Authenticated routes that skip explicit `auth.getUser()` (Medium)

- **Description:** Several handlers create a session client and immediately query a resource without calling `supabase.auth.getUser()` first, relying on RLS to filter out unauthorised reads. Examples: `app/api/jobs/[id]/route.ts:77–87` (GET booking), `app/api/data/route.ts:27` (lists all customers/bookings/etc.). Today this happens to be safe-ish for unauthenticated callers (no JWT → RLS denies → empty result → 404). However, given Finding 1 (RLS policies are `USING (true)` for `authenticated`), once any user is signed in, these handlers leak every booking/customer to them — a textbook BOLA (Broken Object-Level Authorization). Fixing Finding 1 reduces this to a defence-in-depth issue.
- **Affected area:** `app/api/jobs/[id]/route.ts:77–87`, `app/api/data/route.ts:27`, possibly other GET handlers.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**
- **Effort estimate:** **Low–Medium**.
- **Cost implication:** Low.
- **Scope of fix:** Cross-cutting but small.
- **Recommended fix:** Call `requireUser()` (or `requireRole(...)`) at the top of every API handler, including GETs. Have `/api/jobs/[id]` enforce that the requester is the owner / assigned salesperson / admin / manager.

---

### Finding 10 — Cron Bearer comparison is not constant-time (Low)

- **Description:** `app/api/cron/email-sync/route.ts:7` and `app/api/cron/pipeline-auto-close/route.ts:42` compare the `Authorization` header to `\`Bearer ${process.env.CRON_SECRET}\`` with `!==`. JavaScript string equality is not constant-time, leaking a small timing signal. Vercel cron requests are originated by Vercel infrastructure, but the route is publicly reachable.
- **Affected area:** `app/api/cron/email-sync/route.ts:4–9`, `app/api/cron/pipeline-auto-close/route.ts:39–44`.
- **Likelihood / Impact / Risk:** Low / Low / **Low**
- **Effort estimate:** **Low**.
- **Cost implication:** Low.
- **Scope of fix:** Localised (1 helper).
- **Recommended fix:** Use `crypto.timingSafeEqual` on equal-length buffers, or rely on Vercel's signed cron header (`x-vercel-cron-signature`) when available.

---

### Finding 11 — Dev quick-login defaults bake `password123` into the bundle (Low)

- **Description:** `app/login/page.tsx:16–23` ships hardcoded employee emails (`carmen@`, `dirk@`, `leonie@`, `monade@`, `douwlien@luxustravel.co.za`) and `password123` as the default dev quick-login. The button is gated by `process.env.NODE_ENV === "development"`. If the dev/preview Supabase has those accounts set with the matching password, anyone able to run the app in dev mode (or anyone who can reach a misconfigured preview deploy with `NODE_ENV=development`) can log in as a real consultant.
- **Affected area:** `app/login/page.tsx:14–100, 208–241, 352–364`.
- **Likelihood / Impact / Risk:** Low / Medium / **Low**
- **Effort estimate:** **Low**.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Remove the hardcoded list and require `NEXT_PUBLIC_DEV_QUICK_LOGIN_EMAIL` / `NEXT_PUBLIC_DEV_QUICK_LOGIN_PASSWORDS` (or localStorage) to be set explicitly. Refuse to render the button on any host other than `localhost` (also check `window.location.hostname`). Confirm preview/production builds use `NODE_ENV=production`. Rotate any shared dev passwords still in use.

---

### Finding 12 — `CRON_SECRET` and `EMAIL_CREDENTIAL_ENCRYPTION_KEY` not documented (Low)

- **Description:** `.env.local.example` documents the Supabase keys, dev quick-login, and Resend, but does not mention `CRON_SECRET` (used by `app/api/cron/*`) or `EMAIL_CREDENTIAL_ENCRYPTION_KEY` (used by `lib/inbound-email/crypto.ts`). A new operator can deploy without configuring them or pick weak values. Note that the existing crypto helper accepts arbitrary-length input and SHA-256s it into a 32-byte key, so a weak human-chosen passphrase becomes the actual entropy.
- **Affected area:** `.env.local.example`, `lib/inbound-email/crypto.ts:6–14`, `app/api/cron/*/route.ts`.
- **Likelihood / Impact / Risk:** Medium / Low / **Low**
- **Effort estimate:** **Low**.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Add both variables to `.env.local.example` with guidance to generate via `openssl rand -base64 48`. Validate their length on boot (e.g. reject `EMAIL_CREDENTIAL_ENCRYPTION_KEY` shorter than 32 raw bytes) and document in `DEVELOPMENT_ENVIRONMENT.md`.

---

### Finding 13 — Concrete Supabase project refs in `.env.sync.local.example` (Low)

- **Description:** `.env.sync.local.example` contains real-looking project refs (`isxpuhttwzyvjclrnhbg`, `qlwldfhjfbxliyjvoziu`) and a specific pooler hostname (`aws-1-eu-west-1.pooler.supabase.com`) for what appear to be the actual dev and prod environments. Project refs are not credentials, but publishing them shrinks the search space for an attacker who has obtained a database password (or service-role key) elsewhere, and confirms that production is hosted on `aws-1-eu-west-1`.
- **Affected area:** `.env.sync.local.example:10–17`.
- **Likelihood / Impact / Risk:** Low / Low / **Low**
- **Effort estimate:** **Low**.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Replace concrete refs with placeholders (`<dev-project-ref>`, `<prod-project-ref>`) and remove the specific pooler hostname.

---

### Finding 14 — `voucher-assets` storage bucket is public (Low)

- **Description:** `supabase/config.toml:121–124` declares `[storage.buckets.voucher-assets] public = true`. Logo / banner / accent assets uploaded via `app/api/voucher-template/upload/route.ts` are world-readable through the bucket's public URL. This is presumably intentional (so vouchers and emails can hot-link them), but means anyone with a URL can fetch — and there is no protection against an admin uploading something private to that bucket by mistake.
- **Affected area:** `supabase/config.toml:121–124`, `app/api/voucher-template/upload/route.ts:84–87`.
- **Likelihood / Impact / Risk:** Low / Low / **Low**
- **Effort estimate:** **Low**.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Confirm that nothing sensitive is ever uploaded to this bucket. Optionally serve voucher assets through signed URLs and flip the bucket private. Add a comment near the upload route making the public-by-design choice explicit.

---

## 4. Priority Actions

Address in this order — top entries are the highest risk-to-effort wins:

1. **Replace `USING (true)` RLS with role/owner-aware policies** (Finding 1) — without this, every other authorization control is bypassable. Pair with regression tests in `supabase/seed.test.ts`.
2. **Lock down `/api/enquiries`** (Finding 2): Zod schema, request size & array caps, IP rate limit, optional CAPTCHA, fixed audit `actor`.
3. **Disable Supabase self-service signup** in both `supabase/config.toml` and the hosted project (Finding 3).
4. **Add security headers** via `next.config.mjs` `async headers()` (Finding 4) — quick, broad-impact win.
5. **Standardise error responses** to use `safeSupabaseError()` everywhere (Finding 7) — mostly mechanical; reduces info leakage immediately.
6. **Raise password minimums** to 12 with complexity in app and Supabase config (Finding 5).
7. **Add explicit `requireUser()` / `requireRole()` to every API handler** (Finding 9), then revisit Finding 1's RLS policies as defence in depth.
8. **Sanitise template HTML preview** (Finding 6) and add the CSP from action 4.
9. **Add app-level rate limiting** (Finding 8) once #4 is in place.
10. **House-keeping:** swap to `timingSafeEqual` for cron auth (Finding 10), remove hardcoded dev credentials (Finding 11), document `CRON_SECRET` + `EMAIL_CREDENTIAL_ENCRYPTION_KEY` (Finding 12), scrub project refs from the example file (Finding 13), and confirm bucket privacy (Finding 14).
