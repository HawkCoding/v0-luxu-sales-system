# Security Review Report

| Field | Value |
| --- | --- |
| **Repository** | `hawkcoding/v0-luxu-sales-system` |
| **Run date** | 2026-05-31 |
| **Branch reviewed** | `claude/friendly-curie-BY523` |
| **App version** | `3.22` (`lib/version.ts`) |
| **Overall security posture** | **Moderate** |
| **Highest-risk issue** | Unauthenticated public POST `/api/enquiries` uses the service-role client without Zod validation, rate limiting, or CAPTCHA |
| **Lowest-risk issue** | Heuristic validation of `SUPABASE_SERVICE_ROLE_KEY` format (`includes(".")`) |
| **Total findings** | 12 |

---

## 1. Summary

- **Total vulnerabilities identified:** 12
- **Highest risk:** Public enquiry intake endpoint is unauthenticated, RLS-bypassing, and unvalidated — enables data poisoning, denial-of-wallet, and stage-corruption at scale.
- **Lowest risk:** `SUPABASE_SERVICE_ROLE_KEY` is only sanity-checked by substring `"."` — a misconfiguration risk, not a direct vulnerability.
- **Overall posture:** **Moderate.** Strong patterns exist (RLS-aware session client, role gating, audit logging, AES-256-GCM credential encryption), but several boundary-level defenses are missing: HTTP security headers, public-route validation/rate limiting, MIME-type sniffing on uploads, and a few weak Supabase auth defaults.

---

## 2. Risk Matrix

| # | Issue | Likelihood | Impact | Risk Level |
| --- | --- | --- | --- | --- |
| 1 | Public `/api/enquiries` POST: no auth, no Zod, no rate limit, service-role | High | High | **Critical** |
| 2 | No HTTP security headers (CSP, HSTS, X-Frame-Options, etc.) | High | Medium | **High** |
| 3 | Supabase signup enabled + auto-profile trigger grants `consultant` role | Medium | High | **High** |
| 4 | Email-template `bodyHtml` rendered via `dangerouslySetInnerHTML` | Low | High | **Medium** |
| 5 | File upload trusts client-supplied MIME type (`file.type`) | Medium | Medium | **Medium** |
| 6 | Weak Supabase password policy (`min_length=6`, no complexity, `secure_password_change=false`) | Medium | Medium | **Medium** |
| 7 | Hardcoded dev quick-login emails + password in client source | Low | Medium | **Medium** |
| 8 | CRON secret compared with non-constant-time `!==` | Low | Medium | **Low** |
| 9 | No CSRF defense beyond Supabase cookie `SameSite` defaults | Low | Medium | **Low** |
| 10 | Service-role error details logged via `console.error` may surface in shared logs | Low | Low | **Low** |
| 11 | `proxy.ts` does not centrally gate `/app` or `/api` paths | Low | Low | **Low** |
| 12 | `SUPABASE_SERVICE_ROLE_KEY` validated only by substring `"."` | Low | Low | **Low** |

---

## 3. Detailed Findings

### Finding 1 — Public enquiry POST is unauthenticated, RLS-bypassing, and unvalidated

- **Affected area:** `app/api/enquiries/route.ts:410-419` (POST handler) and the cascading inserts at lines 507-604 (`bookings`, `booking_suites`, `travellers`, `transport_requests`).
- **Description:** The POST handler uses `createServiceClient()` ("Use the service-role client — this route is public") and calls `auth.getUser()` only to optionally annotate the actor — there is no authentication or authorization gate. There is also **no Zod schema** for the body (the only `safeParse` in the file, `enquiryFilterSchema`, applies to GET filters). An unauthenticated attacker can submit arbitrary JSON that is written via the service role into `customers`, `bookings`, `booking_suites`, `travellers`, `transport_requests`, and `vehicle_rental_details`. There is no rate limiting, IP throttling, or CAPTCHA. Suite selections, package IDs, route IDs, and supplier IDs are honored verbatim from the body.
- **Likelihood / Impact / Risk:** High / High / **Critical**
- **Effort:** Medium — add a Zod schema, switch to a public-form-only allowlist of writable columns, add server-side rate limiting (Vercel KV / Upstash / Supabase function), and consider hCaptcha.
- **Cost implication:** Medium (a rate-limit service tier is paid).
- **Scope of fix:** Localised — single route plus a shared rate-limit helper.
- **Recommended fix:**
  1. Add a strict Zod schema that whitelists known fields, lengths, and enum values, then `safeParse` and reject unknown fields.
  2. Move the service-role write behind an authenticated salesperson session **unless** the call comes from the public marketing form; for the public form, mount a separate read-only intake table and process it via the existing `email-import` worker, so RLS still applies.
  3. Add IP-based rate limiting (e.g. `@upstash/ratelimit` keyed by `x-forwarded-for`) — start at 5 req/min/IP.
  4. Require an hCaptcha token for the public web form and verify it server-side before any insert.

---

### Finding 2 — No HTTP security headers configured

- **Affected area:** `next.config.mjs`, `vercel.json` (no `headers()` block, no CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, or Permissions-Policy).
- **Description:** A scan of `next.config.mjs`, `vercel.json`, and route handlers found no security headers being set. Without HSTS, downgrade attacks remain feasible after the first HTTPS hit. Without X-Frame-Options/`frame-ancestors`, the app can be framed for clickjacking — particularly damaging because logged-in salespeople can take destructive actions (issue invoices, change pipeline stage). Without CSP, any future XSS (e.g. via the template HTML render at `app/app/templates/page.tsx:185`) has unbounded blast radius.
- **Likelihood / Impact / Risk:** High / Medium / **High**
- **Effort:** Low — add a `headers()` function in `next.config.mjs`.
- **Cost implication:** Low.
- **Scope of fix:** Localised (single config file).
- **Recommended fix:** Add to `next.config.mjs`:
  ```js
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Content-Security-Policy", value: "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'" },
      ],
    }]
  }
  ```

---

### Finding 3 — Supabase signup enabled lets anyone self-provision a `consultant` profile

- **Affected area:** `supabase/config.toml` (`enable_signup = true`, `[auth.email] enable_signup = true`) and `handle_new_user` trigger in `supabase/migrations/20260523100000_sync_remote_rls_and_functions.sql:54-66` plus the JWT hook at line 21 which trusts `profiles.clearance_level` for any user that lands there.
- **Description:** Although `/api/users` is admin-gated, the underlying Supabase Auth signup endpoint is enabled. A direct `POST` to Supabase's `/auth/v1/signup` using the anon key creates an `auth.users` row, which fires `handle_new_user` and inserts a `profiles` row with `clearance_level = 'consultant'`. The `custom_access_token_hook` then mints a JWT with `app_metadata.clearance_level = 'consultant'` — and `app/app/layout.tsx:21-35` accepts that JWT role. The new account would pass `requireRole(["admin","manager","consultant"])` on payments, documents, quotes, etc.
- **Likelihood / Impact / Risk:** Medium / High / **High**
- **Effort:** Low (disable signup in production); Medium (also harden the trigger).
- **Cost implication:** Low.
- **Scope of fix:** Localised, but verifying the production project's actual setting in Supabase Dashboard is required.
- **Recommended fix:**
  1. Set `enable_signup = false` in production (Dashboard → Authentication → Providers → Email → "Allow new users to sign up").
  2. Update `handle_new_user` to default new rows to an inert role such as `pending` or `readonly`, requiring an admin to promote.
  3. Enforce `is_active = true` in the `custom_access_token_hook`'s lookup so deactivated users cannot mint new JWTs with elevated roles.

---

### Finding 4 — Email-template HTML rendered with `dangerouslySetInnerHTML`

- **Affected area:** `app/app/templates/page.tsx:185`: `<div ... dangerouslySetInnerHTML={{ __html: preview?.bodyHtml || "" }} />`.
- **Description:** The preview pane renders the saved `bodyHtml` field directly. Template content is editable through `/api/templates`, which is role-gated, but persistent XSS in this surface would execute against an admin/manager session. Combined with **Finding 2** (no CSP), a `<script>` payload would run with full privileges — including the ability to drive arbitrary API calls (issue invoices, reset users, etc.).
- **Likelihood / Impact / Risk:** Low / High / **Medium**
- **Effort:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Sanitize on render with DOMPurify (`pnpm add isomorphic-dompurify`) and wrap the preview in a sandboxed `<iframe sandbox="allow-same-origin">`. Alternatively, sanitize on write at the `/api/templates` boundary and assert a strict allowlist of tags/attributes (`a`, `b`, `i`, `strong`, `em`, `p`, `br`, `ul`, `ol`, `li`, `span`, `div`, `img`, `table`, etc.).

---

### Finding 5 — File upload trusts client-supplied MIME type

- **Affected area:** `app/api/documents/upload/route.ts:71-77`: `if (!allowedMimes.includes(file.type))`.
- **Description:** `file.type` on a `File` object is set by the browser based on the OS's MIME database — an attacker scripting the form can claim any value. There is no magic-byte / content sniffing, so an `.exe`, `.html`, or polyglot payload can be uploaded by labeling it `application/pdf`. The file is then served via a signed URL with `contentType: file.type`, meaning downstream consumers will trust the lie.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**
- **Effort:** Low — sniff with `file-type` from the buffer that's already read.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** After `const buffer = await file.arrayBuffer()`, run `await fileTypeFromBuffer(new Uint8Array(buffer))`; if the detected MIME does not match `file.type` and `allowedMimes`, reject. Persist the **server-detected** MIME (not the client one) when calling `supabase.storage.upload({ contentType })` and `documents.insert`.

---

### Finding 6 — Weak Supabase auth password policy

- **Affected area:** `supabase/config.toml`: `minimum_password_length = 6`, `password_requirements = ""`, `secure_password_change = false`. Also reflected in `app/api/users/route.ts:20` (`z.string().min(6, ...)`) and `app/api/users/[userId]/password/route.ts:59` (`newPassword.length < 6`).
- **Description:** Six-character passwords with no complexity rules are well below current NIST and OWASP recommendations (≥8 + breach-list check). `secure_password_change = false` means a stolen session can rotate the password without re-authentication, breaking lockout.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**
- **Effort:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Cross-cutting (Supabase config + two API routes + the login UI's "minimum 6 characters" copy).
- **Recommended fix:** Raise to `minimum_password_length = 12`, set `password_requirements = "lower_upper_letters_digits"`, enable `secure_password_change = true`, and update the two API schemas to `z.string().min(12)`. Add a leaked-password check via Supabase's HIBP integration if available.

---

### Finding 7 — Hardcoded dev quick-login emails + password in client source

- **Affected area:** `app/login/page.tsx:20-31`: `defaultDevQuickLoginEmails` lists five real `luxustravel.co.za` employee addresses and `defaultDevQuickLoginPasswords = ["password123"]`.
- **Description:** The gate `canUseDevQuickLogin = process.env.NODE_ENV === "development"` prevents the auto-attempt in production builds, but the email list and password constant remain in the public client bundle wherever this file is shipped, and they leak the identities of staff accounts. If any non-production environment with this build pointed at real-data Supabase ever ran with `NODE_ENV=development`, those credentials would auto-authenticate.
- **Likelihood / Impact / Risk:** Low / Medium / **Medium**
- **Effort:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Move the default emails/passwords behind `process.env.NEXT_PUBLIC_DEV_QUICK_LOGIN_*` only (already supported) and delete the hardcoded defaults. Better: strip the entire `DEV_QUICK_LOGIN_START` → `DEV_QUICK_LOGIN_END` block at build time when `NODE_ENV !== "development"` using a `next.config` redirect or a build-time replace, so it never ships to any deployed bundle.

---

### Finding 8 — Cron-secret comparison uses non-constant-time `!==`

- **Affected area:** `app/api/cron/backup/route.ts:10`, `app/api/cron/email-sync/route.ts:7`, `app/api/cron/payment-reminders/route.ts:8`, `app/api/cron/pipeline-auto-close/route.ts:42`, `app/api/cron/quote-follow-ups/route.ts:8`.
- **Description:** All five cron handlers compare the bearer token with `authHeader !== \`Bearer ${process.env.CRON_SECRET}\``. JavaScript string `!==` short-circuits on the first mismatch and is therefore timing-observable in theory. Network jitter makes practical exploitation infeasible against a high-entropy secret, but the pattern is easy to fix.
- **Likelihood / Impact / Risk:** Low / Medium / **Low**
- **Effort:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Cross-cutting (5 files) — extract a shared helper.
- **Recommended fix:** Use `crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(\`Bearer ${process.env.CRON_SECRET}\`))`, guarded by equal-length checks. Move it to `lib/api/cron-auth.ts` and reuse.

---

### Finding 9 — No CSRF defense beyond Supabase cookie `SameSite` default

- **Affected area:** All POST/PATCH/DELETE API routes (`app/api/**/route.ts`). No CSRF token, Origin/Referer check, or `__Host-` prefix verification anywhere.
- **Description:** State-changing endpoints rely entirely on Supabase's cookie defaults (Lax + Secure). Lax stops cross-site form submissions but **not** cross-site `fetch()` from a victim browser whose user is logged in to the app — and not subdomain takeovers. For an admin app that can issue invoices and reset passwords, an explicit Origin check provides cheap defense in depth.
- **Likelihood / Impact / Risk:** Low / Medium / **Low**
- **Effort:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Cross-cutting — add a small `requireSameOrigin(req)` helper used by each role-gated route, or enforce it inside `proxy.ts`.
- **Recommended fix:** In `proxy.ts`, for non-`GET` API requests, verify the `Origin` header is `process.env.NEXT_PUBLIC_APP_URL` (or matches the request's `Host`); otherwise reject with 403.

---

### Finding 10 — Supabase error objects logged via `console.error`

- **Affected area:** `lib/api/responses.ts:21-27` (`safeSupabaseError` logs the raw `cause`), plus 23 other `console.error` sites across `app/api/**`.
- **Description:** `cause` objects from `@supabase/supabase-js` often include query hints, column names, and PostgREST error details. The HTTP body is sanitized correctly (returns only `"Database error"`), but the logs are written to whatever sink Vercel exposes — usually accessible to anyone with project read access. Not user-facing leakage, but a defense-in-depth concern.
- **Likelihood / Impact / Risk:** Low / Low / **Low**
- **Effort:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Cross-cutting (single helper + audit other sites).
- **Recommended fix:** Strip `details` and `hint` before logging; log only `code`, `message`, and the route's `scope`. Forward sensitive diagnostics to a structured logger (e.g. Pino) with redact rules.

---

### Finding 11 — `proxy.ts` does not centrally gate `/app` or `/api` paths

- **Affected area:** `proxy.ts:29-76` (Next.js 16 proxy / middleware).
- **Description:** The proxy refreshes the Supabase session and redirects `/login` away when authenticated, but does not enforce auth on `/app/**` or `/api/**`. Each route handler must remember to call `requireUser()`/`requireRole()`. The current routes look complete, but any future route author who forgets the helper creates a hole. A central allow/deny in the proxy is cheaper than catching this in review.
- **Likelihood / Impact / Risk:** Low / Low / **Low**
- **Effort:** Medium (need to enumerate public routes — `/api/enquiries` POST, `/auth/callback`, `/api/logout`, packages public detail, etc.).
- **Cost implication:** Low.
- **Scope of fix:** Localised but architecturally cross-cutting.
- **Recommended fix:** In `proxy.ts`, add an explicit `PUBLIC_PATH_PREFIXES` allowlist; for everything else under `/app` and `/api` require a non-null `data.user` before falling through to the route. Keep per-route role checks as well.

---

### Finding 12 — `SUPABASE_SERVICE_ROLE_KEY` validated only by `.includes(".")`

- **Affected area:** `lib/supabase/server.ts:52-57`.
- **Description:** The check only ensures the string contains a `.`, which is true of every JWT including the anon key. If an operator accidentally pastes the anon key into the service-role slot, every "trusted server-side" code path silently runs RLS-restricted. Some workers (e.g. `enquiries` POST inserting into many tables) would behave inconsistently; restore would fail. Not a vulnerability per se, but an operational pitfall that masquerades as one.
- **Likelihood / Impact / Risk:** Low / Low / **Low**
- **Effort:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Decode the JWT (no signature check needed for shape) and assert `payload.role === "service_role"`; throw at boot if not. Optionally fail the build via `scripts/start-next-dev.mjs` when this check fails locally.

---

## 4. Priority Actions

Ranked by **highest risk × lowest effort** wins:

1. **Add HTTP security headers** (Finding 2) — single config block, knocks out a high-likelihood weakness and shrinks blast radius of any future XSS.
2. **Lock down `/api/enquiries` POST** (Finding 1) — add Zod schema + rate limit + CAPTCHA. This is the only externally-reachable write path and uses the service role.
3. **Disable Supabase signup in production + harden `handle_new_user`** (Finding 3) — closes the silent self-provisioning hole.
4. **Sanitize template HTML preview** (Finding 4) — wrap with DOMPurify; pairs with Finding 2 for full XSS containment.
5. **Sniff MIME on upload** (Finding 5) — add `file-type` lookup.
6. **Raise password policy + enable `secure_password_change`** (Finding 6) — one config change + two `z.string().min(12)` edits.
7. **Strip hardcoded dev quick-login defaults** (Finding 7) — delete two arrays.
8. **Use `timingSafeEqual` for cron auth** (Finding 8) — extract a shared helper.
9. Address Findings 9–12 in a single defense-in-depth pass (Origin checks, log redaction, central middleware gate, service-role JWT shape check).

---

*Generated by the security review workflow. No application code was modified. Report saved to `/security-reports/latest-security-review.md`.*
