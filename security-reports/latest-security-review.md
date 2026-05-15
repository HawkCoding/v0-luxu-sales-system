# Security Review — Luxus Sales System

| Field | Value |
| --- | --- |
| Repository | `hawkcoding/v0-luxu-sales-system` |
| Run date | 2026-05-15 |
| Branch reviewed | `claude/friendly-curie-2pn5W` (working tree) |
| Total findings | 15 |
| Overall security posture | **Poor** |
| Highest-risk issue | Permissive RLS combined with open Supabase signup — every authenticated user can read/write the whole database (F1) |
| Lowest-risk issue | ESLint not linting TypeScript sources (F15) |

---

## 1. Summary

- **Total vulnerabilities identified:** 15 (3 Critical, 4 High, 5 Medium, 3 Low)
- **Highest-risk issue:** **Permissive RLS + open signup (F1).** Every RLS policy on core tables (`bookings`, `customers`, `quotes`, `payments`, `audit_logs`, …) is `USING (true) / WITH CHECK (true)` for the `authenticated` role, while `supabase/config.toml` ships with `enable_signup = true`, `enable_confirmations = false`, and `minimum_password_length = 6`. Anyone who can sign up via the public Supabase Auth API receives `clearance_level = 'consultant'` from the `custom_access_token_hook` and can immediately read or modify every booking, payment, audit log, and customer record. Role-based access control lives only in the API layer, so any direct call to PostgREST or `supabase-js` from the browser bypasses it entirely.
- **Lowest-risk issue:** **ESLint not linting TS/TSX (F15)** — `pnpm lint` runs with `--ext .js,.mjs,.cjs --no-eslintrc`, so application TypeScript code is never linted, and security-relevant rules (no-unsanitized, no-eval, react/no-danger, etc.) cannot fire.
- **Posture:** Authentication is wired up correctly with Supabase, secrets and the service-role key are kept server-side, and Zod validation is in place on most authenticated mutation routes. However, the security model leans almost entirely on the API tier, while RLS is wide-open and one public route (`/api/enquiries`) uses the service-role client without input validation or rate limiting. The defence-in-depth posture is weak.

---

## 2. Risk Matrix

| # | Issue | Likelihood | Impact | Risk |
| --- | --- | --- | --- | --- |
| F1 | Permissive RLS (`USING (true)`) on all core tables combined with `enable_signup = true` | High | High | **Critical** |
| F2 | Public `/api/enquiries` POST uses service-role client with no Zod validation, rate limit, or captcha | High | High | **Critical** |
| F3 | `proxy.ts` is dead code — Next.js middleware must be `middleware.ts`; session refresh & `/login` redirect logic never runs | High | High | **Critical** |
| F4 | `GET /api/jobs/[id]` and `GET /api/data` skip explicit auth checks and rely solely on the permissive RLS layer | High | High | **High** |
| F5 | Open redirect in `/auth/callback?next=` — only `startsWith("/")` is enforced, allowing `//attacker.com` | Medium | High | **High** |
| F6 | Weak password policy — `minimum_password_length = 6`, no complexity, admin password-reset route also enforces only 6 chars | High | Medium | **High** |
| F7 | `dangerouslySetInnerHTML` renders raw template HTML in `app/app/templates/page.tsx` without sanitization | Medium | High | **High** |
| F8 | No HTTP security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) | High | Medium | **Medium** |
| F9 | Hardcoded dev passwords + real staff emails committed in `app/login/page.tsx` (gated by `NODE_ENV` but visible in the repo) | Medium | Medium | **Medium** |
| F10 | No application-level rate limiting on auth-adjacent routes (correspondence email send, password reset, voucher generation) | Medium | Medium | **Medium** |
| F11 | Cron secret comparison uses `!==` string compare (timing oracle) and 401 response leaks whether `CRON_SECRET` is configured | Low | Medium | **Medium** |
| F12 | `next.config.mjs` has `images.unoptimized: true` — the Next image proxy and CSP defaults that ship with it are not in play | Low | Medium | **Medium** |
| F13 | Email/IMAP credentials stored with AES-256-GCM but the KDF is a single SHA-256 over the env var (no PBKDF2/HKDF, no per-record salt) | Low | High | **Medium** |
| F14 | `/api/users/[userId]` DELETE permanently removes auth users and audit_log subject row without preserving the soft-deleted record; audit history loses linkage on cascade | Low | Medium | **Low** |
| F15 | ESLint configured to skip `.ts`/`.tsx` (`--ext .js,.mjs,.cjs --no-eslintrc`); security lint rules never run | High | Low | **Low** |

---

## 3. Detailed Findings

### F1 — Permissive RLS combined with open Supabase signup *(Critical)*

- **Description:** `supabase/migrations/20260308095136_remote_schema.sql` enables RLS on every core table but installs policies like:
  ```sql
  CREATE POLICY "biz_select" ON "public"."bookings"  FOR SELECT TO "authenticated" USING (true);
  CREATE POLICY "biz_insert" ON "public"."bookings"  FOR INSERT TO "authenticated" WITH CHECK (true);
  CREATE POLICY "biz_delete" ON "public"."customers" FOR DELETE TO "authenticated" USING (true);
  CREATE POLICY "al_select"  ON "public"."audit_logs" FOR SELECT TO "authenticated" USING (true);
  ```
  The same `USING (true)` pattern repeats across `bookings`, `customers`, `quotes`, `quote_line_items`, `payments`, `correspondences`, `documents`, `itineraries`, `audit_logs`, `pipeline_history`, and others (94 policies in that one migration).
  Meanwhile `supabase/config.toml` (lines ~166-179) ships with `enable_signup = true`, `enable_confirmations = false`, `enable_anonymous_sign_ins = false`, `minimum_password_length = 6`. The `custom_access_token_hook` (`supabase/migrations/20260429160000_add_clearance_level_jwt_hook.sql`) **defaults missing profiles to `clearance_level = 'consultant'`**, so a freshly-signed-up user gets a working JWT before any admin has approved them.
  Net effect: anyone who can hit `https://<project>.supabase.co/auth/v1/signup` directly (or any client using the published anon key) can read every booking, customer, quote, payment, audit log, and pipeline change in the system. Role enforcement only happens in the Next.js API layer, which can be bypassed by calling PostgREST directly.
- **Affected area:** `supabase/migrations/20260308095136_remote_schema.sql`; `supabase/migrations/20260429160000_add_clearance_level_jwt_hook.sql`; `supabase/config.toml`; `lib/supabase/client.ts`.
- **Likelihood / Impact / Risk:** High / High / **Critical**.
- **Effort:** High — requires rewriting every policy to check `(SELECT clearance_level FROM profiles WHERE user_id = auth.uid())` (or a SECURITY DEFINER helper) and gating writes per role; adding tests for each policy.
- **Cost implication:** High (security regression risk across the whole UI; needs migration + QA).
- **Scope of fix:** Cross-cutting — all RLS policies, the JWT hook default, and Supabase Auth project settings.
- **Recommended fix:**
  1. In the hosted Supabase project, set `enable_signup = false` and `enable_confirmations = true`; keep `minimum_password_length >= 12` with `password_requirements = "lower_upper_letters_digits_symbols"`.
  2. Change the default in `custom_access_token_hook` to **reject** missing profiles (e.g. return claims unchanged or set `clearance_level = 'denied'`) rather than silently granting `'consultant'`.
  3. Rewrite the `biz_*` and `al_*` policies so reads/writes consult `profiles.clearance_level` (e.g. a SECURITY DEFINER function `auth_role()` that returns the JWT claim, with policies like `USING (auth_role() IN ('admin','manager','consultant'))` for select/insert and stricter sets for delete/update). Add policy tests under `supabase/seed.test.ts` (or a new `policies.test.sql`).

---

### F2 — Public `/api/enquiries` POST: service-role client, no Zod, no rate limit, no captcha *(Critical)*

- **Description:** `app/api/enquiries/route.ts` is the public enquiry intake. It calls `createServiceClient()` (which **bypasses RLS**) and then directly persists request body fields into `customers`, `bookings`, `booking_suites`, `travellers`, `booking_transport_requests`, and `booking_vehicle_rental_details`, plus a draft quote. There is **no Zod schema**, no auth (the route is public by design), no captcha, and no rate limiting. The handler also spreads `body.extractedJson` into the persisted `extracted_json` JSONB column with only a shallow `typeof === "object"` check, allowing an attacker to inject arbitrary structured fields into a server-trusted JSON column that is then read in `/api/data` and the UI.
- **Affected area:** `app/api/enquiries/route.ts`.
- **Likelihood / Impact / Risk:** High / High / **Critical**.
- **Effort:** Medium — add a Zod schema for the entire payload, add a captcha (hCaptcha or Turnstile, already prepared in `supabase/config.toml`), and add an IP-based rate limiter (e.g. `@upstash/ratelimit` or a small in-memory limiter behind a CDN cache).
- **Cost implication:** Medium (Turnstile is free; Upstash has a free tier; integration touches the public form).
- **Scope of fix:** Localised to this route + a thin shared rate-limit helper.
- **Recommended fix:**
  1. Define a strict Zod schema (`enquiryBodySchema`) covering every field used (`name`, `surname`, `email`, `contactNumber`, `country`, `direction`, `packageOption`, `hotelOption`, `departureDate`, `noOfAdults`, `noOfChildren`, `noOfSuites`, `travellers`, `childTravellers`, `transportRequests`, `extractedJson` — the latter validated as a closed object).
  2. Reject payloads where `extractedJson` keys are not in an explicit allowlist.
  3. Enforce a per-IP rate limit (e.g. 5 enquiries / 10 minutes / IP) and a captcha challenge before the service-role write.
  4. Verify the `Origin` header matches the public form's domain when present.

---

### F3 — `proxy.ts` is not Next.js middleware (dead code) *(Critical)*

- **Description:** The file `proxy.ts` at the repo root implements Supabase auth-token refresh and a logged-in `/login → /app` redirect, with `export const config = { matcher: [...] }`. Next.js will only execute middleware from a file named `middleware.ts` (or `middleware.js`) at the project root — there is no such file (`find -maxdepth 3 -name middleware.ts` returns empty), and no other module imports `proxy.ts` (`grep` for "from \"./proxy\"" / "import.*proxy" finds nothing). As a result:
  - Expired Supabase access tokens are never refreshed by the server; users are silently logged out when their JWT expires.
  - The stale-refresh-token cookie cleanup never runs; users hit unhandled errors instead.
  - There is no server-side `/login → /app` redirect for already-authenticated users (only the client-side redirect in `app/login/page.tsx`), so an attacker who lures a user to a phishing `/login` clone with a fake `error=` param has a slightly easier surface, and the documented matcher-based protections do not exist.
- **Affected area:** `proxy.ts`; absence of `middleware.ts`.
- **Likelihood / Impact / Risk:** High / High / **Critical** (silent loss of session-refresh middleware is both a UX bug and a defence-in-depth gap).
- **Effort:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Rename `proxy.ts` → `middleware.ts` and rename the exported `proxy` function → `middleware`. Add a quick smoke test (e.g. a `vitest` request that hits `/login` while authenticated and asserts the redirect). Confirm in CI that `next build` reports a middleware bundle.

---

### F4 — Auth bypass via permissive RLS on `GET /api/jobs/[id]` and `GET /api/data` *(High)*

- **Description:** `app/api/jobs/[id]/route.ts` `GET` handler (line 77) calls `createSessionClient()` and immediately queries `bookings`, `customers`, `payments`, `audit_logs`, etc. without ever calling `supabase.auth.getUser()` or `requireUser()`. The PATCH/DELETE paths do, but `GET` relies entirely on RLS. Combined with F1, this means any authenticated user (including a self-signed-up attacker) can fetch every booking detail by ID. `app/api/data/route.ts` is the same pattern — it does call `getUser()`, but only to gate audit-log inclusion; customers/bookings/payments/quotes are returned even when `user` is null (they will be empty under RLS in the *current* schema only because RLS denies anonymous; an authenticated user with no profile gets everything).
- **Affected area:** `app/api/jobs/[id]/route.ts` (lines 77-360), `app/api/data/route.ts` (lines 27-95).
- **Likelihood / Impact / Risk:** High / High / **High**.
- **Effort:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised (each route can adopt the shared `requireUser()` helper from `lib/api/auth.ts`).
- **Recommended fix:** Replace the bare `createSessionClient()` opening in `GET` with `const auth = await requireUser(); if (!auth.ok) return auth.response`. Apply consistently across all GET routes that read business data.

---

### F5 — Open redirect in `/auth/callback?next=` *(High)*

- **Description:** `app/auth/callback/route.ts` calls `getSafeNextPath(searchParams.get("next"))` which only checks `rawNext.startsWith("/")`. A `next` of `//evil.com/x` passes the check and produces `Location: https://<your-domain>//evil.com/x`. Some browsers/proxies (including older Safari and intermediaries that normalise double-slashes) treat this as a protocol-relative URL and redirect to `evil.com`. Even when the browser keeps the user on your origin, the link looks legitimate in phishing.
- **Affected area:** `app/auth/callback/route.ts` (lines 4-7).
- **Likelihood / Impact / Risk:** Medium / High / **High**.
- **Effort:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Reject `next` values that start with `//` or `/\\`, that contain `:` before the first `/`, or that don't match `^/[A-Za-z0-9/_\-?=&%.]*$`. Or use `new URL(next, origin)` and assert `parsed.origin === origin`.

---

### F6 — Weak password policy *(High)*

- **Description:** `supabase/config.toml` sets `minimum_password_length = 6` with `password_requirements = ""`, and `app/api/users/[userId]/password/route.ts` enforces the same 6-char minimum (`newPassword.length < 6`). `app/api/users/route.ts` creates users via `service.auth.admin.createUser` with the admin-supplied password and a Zod minimum of 6 characters as well. Six characters with no complexity requirement is below the NIST 2024 / OWASP ASVS 4.0 baseline; combined with F1 it makes account takeover and credential stuffing materially easier.
- **Affected area:** `supabase/config.toml`; `app/api/users/route.ts` (`password: z.string().min(6)`); `app/api/users/[userId]/password/route.ts` (`newPassword.length < 6`).
- **Likelihood / Impact / Risk:** High / Medium / **High**.
- **Effort:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Bump to `minimum_password_length = 12` and `password_requirements = "lower_upper_letters_digits"` in `supabase/config.toml` and on the hosted project; align both API routes' Zod schemas. Consider integrating Supabase's HIBP password-pwned check, or a manual `pwnedpasswords.com` k-anonymity check before accepting new passwords.

---

### F7 — `dangerouslySetInnerHTML` rendering unsanitized template HTML *(High)*

- **Description:** `app/app/templates/page.tsx` (line 185) renders `preview?.bodyHtml` directly with `dangerouslySetInnerHTML={{ __html: preview?.bodyHtml || "" }}`. Templates can be edited by managers/admins, but their HTML is also generated from email-template helpers and may incorporate untrusted strings (e.g. customer names, free-text notes). Any reflected script in those fields will execute in the admin's session, which is the highest-privilege session in the app.
- **Affected area:** `app/app/templates/page.tsx:185`.
- **Likelihood / Impact / Risk:** Medium / High / **High**.
- **Effort:** Low.
- **Cost implication:** Low (`pnpm add dompurify isomorphic-dompurify`).
- **Scope of fix:** Localised.
- **Recommended fix:** Wrap the value in `DOMPurify.sanitize(bodyHtml, { USE_PROFILES: { html: true } })` server-side (in the API that produces `preview`) **and** before passing to `dangerouslySetInnerHTML`. Disallow `<script>`, inline event handlers, `javascript:` URLs, and `<style>` (or add a strict CSS allowlist). Alternatively render the preview in a sandboxed iframe with `sandbox="allow-same-origin"` removed.

---

### F8 — Missing HTTP security headers *(Medium)*

- **Description:** `next.config.mjs` has no `headers()` and `vercel.json` has none either. The app ships without Content-Security-Policy, Strict-Transport-Security, X-Frame-Options/`frame-ancestors`, X-Content-Type-Options, Referrer-Policy, or Permissions-Policy. Combined with F7 this widens the XSS impact.
- **Affected area:** `next.config.mjs`, `vercel.json`.
- **Likelihood / Impact / Risk:** High / Medium / **Medium**.
- **Effort:** Low.
- **Cost implication:** Low (some CSP tuning required for `@vercel/analytics`, Resend, Google Fonts).
- **Scope of fix:** Localised.
- **Recommended fix:** Add a `headers()` block in `next.config.mjs`:
  ```js
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "X-Content-Type-Options",    value: "nosniff" },
        { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy",        value: "camera=(), microphone=(), geolocation=()" },
        { key: "Content-Security-Policy",   value: "default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co https://api.resend.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
      ],
    }]
  }
  ```
  Tighten CSP after measuring CSP-report-only violations.

---

### F9 — Hardcoded dev passwords + real staff emails in source *(Medium)*

- **Description:** `app/login/page.tsx` (lines 16-23) hardcodes 5 staff emails (`carmen@…`, `dirk@…`, `leonie@…`, `monade@…`, `douwlien@luxustravel.co.za`) and the default password `password123`. The block is gated by `process.env.NODE_ENV === "development"`, but the strings are in the public repository. If any shared/staging Supabase project uses these credentials (the README and `.env.local.example` describe a "hosted dev branch"), they are effectively published.
- **Affected area:** `app/login/page.tsx:13-90`.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**.
- **Effort:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Remove the hardcoded defaults; require `NEXT_PUBLIC_DEV_QUICK_LOGIN_EMAIL` / `NEXT_PUBLIC_DEV_QUICK_LOGIN_PASSWORDS` to be set explicitly in the dev env file. Also confirm none of the listed addresses are re-used as real Supabase accounts on the hosted dev branch.

---

### F10 — No application rate limiting on authenticated routes *(Medium)*

- **Description:** Routes that send email or perform expensive operations (`POST /api/correspondence`, `POST /api/voucher/generate`, `POST /api/users/[userId]/password`, `POST /api/enquiries`) have no per-user/IP rate limits. Supabase's auth rate limits help for sign-in/sign-up only. A compromised consultant account or a malicious admin can fan out spam through `sendEmail`, generate large PDFs (DoS), or brute-force admin password resets quickly.
- **Affected area:** `app/api/correspondence/route.ts`, `app/api/voucher/generate/route.ts`, `app/api/users/[userId]/password/route.ts`, `app/api/enquiries/route.ts`.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**.
- **Effort:** Medium (add a small `lib/api/rate-limit.ts` helper).
- **Cost implication:** Low–Medium (Upstash free tier or in-memory + Vercel Edge KV).
- **Scope of fix:** Cross-cutting.
- **Recommended fix:** Introduce a shared `withRateLimit({ key, max, windowSec })` helper keyed on `auth.user.id` + IP for authenticated routes and on IP for `/api/enquiries`. Suggested defaults: email-send 20/hour/user, voucher 30/hour/user, password reset 10/hour/admin, enquiry 5/10min/IP.

---

### F11 — Cron secret comparison is timing-vulnerable and discloses configuration state *(Medium)*

- **Description:** `app/api/cron/email-sync/route.ts` (lines 6-10) and `app/api/cron/pipeline-auto-close/route.ts` (lines 41-44) compare the bearer header with `authHeader !== \`Bearer ${process.env.CRON_SECRET}\`` using normal string compare and return 401 *also* when `CRON_SECRET` is unset, which reveals whether the secret is configured. A non-constant-time compare leaks bytes in theory under high-resolution timing.
- **Affected area:** Both cron routes.
- **Likelihood / Impact / Risk:** Low / Medium / **Medium**.
- **Effort:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Use `crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))` with equal-length buffers (pad/truncate to the expected length first), and fail closed with a 500 (not 401) when `CRON_SECRET` is unset.

---

### F12 — `images.unoptimized: true` *(Medium)*

- **Description:** `next.config.mjs` sets `images: { unoptimized: true }`. This skips the Next.js image optimizer; any image rendered by `<Image />` is served as-is from the supplied URL. Combined with no `remotePatterns`/`domains` allowlist and no CSP `img-src`, untrusted external images can be referenced.
- **Affected area:** `next.config.mjs`.
- **Likelihood / Impact / Risk:** Low / Medium / **Medium**.
- **Effort:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Remove `unoptimized: true` (or set `images.remotePatterns` to the known Supabase storage host + the voucher CDN host). Combine with the CSP `img-src` allowlist in F8.

---

### F13 — Weak KDF for IMAP credential encryption *(Medium)*

- **Description:** `lib/inbound-email/crypto.ts` derives the AES-256-GCM key with `createHash("sha256").update(secret).digest()`. Single SHA-256 over the env var is not a password-based KDF — it is fine if `EMAIL_CREDENTIAL_ENCRYPTION_KEY` is a high-entropy random 32-byte key from a secret manager, but provides almost no protection if the env value is a memorable phrase. There is also no per-record salt or key versioning.
- **Affected area:** `lib/inbound-email/crypto.ts`.
- **Likelihood / Impact / Risk:** Low / High / **Medium**.
- **Effort:** Medium (data migration to re-encrypt existing rows).
- **Cost implication:** Medium.
- **Scope of fix:** Localised but requires a re-encryption migration.
- **Recommended fix:** Switch to `crypto.subtle.deriveBits` with HKDF over a verified-random `EMAIL_CREDENTIAL_ENCRYPTION_KEY` (require ≥ 32 bytes base64) and a per-record salt stored alongside the ciphertext. Add a `key_version` prefix and a documented rotation procedure. Use Supabase Vault for the env value where possible.

---

### F14 — Hard-delete of users orphans audit log linkage *(Low)*

- **Description:** `app/api/users/[userId]/route.ts` `DELETE` calls `service.auth.admin.deleteUser(userId)` and the prior `service.from("profiles").delete()` (via cascade) removes the profile row. The deactivate path uses `ban_duration: "876000h"` (≈100 years) which is an unusual idiom; preferred Supabase API now exposes `banned_until`. Audit logs reference `actor_user_id` but not all rows are preserved post-delete; investigations of historical actions by a deleted user become harder.
- **Affected area:** `app/api/users/[userId]/route.ts`.
- **Likelihood / Impact / Risk:** Low / Medium / **Low**.
- **Effort:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Soft-delete by default (`is_active = false`, anonymise email/name). Restrict hard delete to a separate explicit endpoint with a re-confirmation step, and copy the deleted profile snapshot into the audit log `meta_json` before removal.

---

### F15 — ESLint not linting TypeScript *(Low)*

- **Description:** `package.json` lint script is `eslint . --ext .js,.mjs,.cjs --no-error-on-unmatched-pattern --no-eslintrc …`. The repository is overwhelmingly `.ts`/`.tsx`, so the linter currently inspects only a handful of `.mjs` scripts. Security-relevant rules (`react/no-danger`, `react/jsx-no-target-blank`, `no-eval`, `@typescript-eslint/no-unsafe-*`, `no-restricted-imports`) are not enforced.
- **Affected area:** `package.json` (line 41).
- **Likelihood / Impact / Risk:** High / Low / **Low**.
- **Effort:** Medium (adopt `eslint-config-next` and `@typescript-eslint`, fix the resulting violations).
- **Cost implication:** Low–Medium.
- **Scope of fix:** Cross-cutting (introduces new errors to fix).
- **Recommended fix:** Re-enable `.ts`/`.tsx` linting using `eslint-config-next` plus `@typescript-eslint/recommended`, add `plugin:react/recommended`, and turn on `react/no-danger`, `no-restricted-imports` (block `node:child_process` from app code), and `security/detect-object-injection`. Wire `pnpm lint` into the existing CI workflow (`.github/workflows/ci.yml`).

---

## 4. Priority Actions

Ordered by highest-risk-vs-lowest-effort first:

1. **F3 — rename `proxy.ts` to `middleware.ts`.** One-line rename, restores session refresh and the `/login → /app` server-side redirect immediately.
2. **F5 — fix the open redirect in `/auth/callback`.** Replace the `startsWith("/")` check with a strict path-only validator. Low effort, prevents phishing.
3. **F4 — add `requireUser()` to `GET /api/jobs/[id]` and `GET /api/data`.** Quick win using the existing helper; closes the auth bypass even before RLS is hardened.
4. **F2 — lock down `/api/enquiries`.** Add a Zod schema, captcha, IP rate limit, and validate `extractedJson` against an allowlist. Largest unauthenticated attack surface in the app.
5. **F1 — rewrite RLS policies and disable open signup.** Highest impact, highest effort. Required before treating the database as a real defence layer. Pair with hardening the JWT default in `custom_access_token_hook`.
6. **F7 — sanitise template preview with DOMPurify** (and pair with F8 CSP).
7. **F8 — add baseline security headers** in `next.config.mjs`.
8. **F6 — raise password requirements to 12+ with complexity.**
9. **F10 — add rate limiting** to email-send / voucher-generate / password-reset routes.
10. **F9 — remove hardcoded dev emails/passwords** from `app/login/page.tsx`.
11. F11, F12, F13, F14, F15 — schedule into hardening sprint backlog; each is low/medium effort with bounded blast radius.

---

*Generated automatically by Claude security review on 2026-05-15. No application code was modified; only this report was written.*
