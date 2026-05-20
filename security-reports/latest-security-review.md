# Security Review — Luxus Sales System

| Field | Value |
| --- | --- |
| Repository | `HawkCoding/v0-luxu-sales-system` |
| Run date | 2026-05-20 |
| Branch reviewed | `claude/friendly-curie-Bqi22` |
| App version reviewed | `2.58` (`lib/version.ts`) |
| Total findings | 14 |
| Highest-risk issue | **F1** — `next@16.1.6` carries multiple known high-severity CVEs (SSRF, Middleware/Proxy bypass, DoS) |
| Lowest-risk issue | **F14** — `console.error` logging includes structured error context across API routes |
| Overall security posture | **Moderate** |

> Scope: full repository state at HEAD of `claude/friendly-curie-Bqi22`. No application code was modified; this report is the only artifact.

---

## 1. Summary

- **Total vulnerabilities:** 14 application/configuration findings plus a `pnpm audit` report of **30 dependency advisories** (3 low / 15 moderate / 12 high) — all 12 highs trace to a single root cause (out-of-date `next`).
- **Highest-risk issue:** `next@16.1.6` is below the latest patched line `>=16.2.5`. The transitive set of advisories includes **SSRF in image optimisation**, **Middleware/Proxy bypass in App Router**, and **HTTP request smuggling in rewrites**. Exploits are remotely reachable and require no authentication.
- **Lowest-risk issue:** Server-side `console.error` calls log structured context (trace IDs, Supabase error objects). They are server-only, but should be reviewed periodically to ensure they never log decrypted credentials, JWTs or PII at scale.
- **Overall posture:** **Moderate** — the application demonstrates good security hygiene (RLS-aware client split, role-gated APIs, Zod at most boundaries, encrypted IMAP credentials, signed cron secret), but is undermined by (a) outdated Next.js with multiple CVEs, (b) one large unauthenticated/unvalidated POST surface (`/api/enquiries`), and (c) the absence of HTTP security headers.

---

## 2. Risk Matrix

| #   | Issue                                                                              | Likelihood | Impact | Risk Level |
| --- | ---------------------------------------------------------------------------------- | ---------- | ------ | ---------- |
| F1  | Out-of-date `next@16.1.6` (12 high-sev advisories, SSRF / proxy-bypass / DoS)      | High       | High   | **Critical** |
| F2  | Public `POST /api/enquiries` uses service-role + no Zod, no rate limit             | High       | High   | **High**   |
| F3  | No HTTP security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)      | High       | Medium | **High**   |
| F4  | Other vulnerable dependencies: `lodash`, `vite`, `picomatch`, `ws`, `postcss`      | Medium     | High   | **High**   |
| F5  | SVG uploads accepted to public `voucher-assets` bucket (stored XSS surface)        | Medium     | High   | **High**   |
| F6  | `dangerouslySetInnerHTML` of template `bodyHtml` in admin Template Preview         | Medium     | Medium | **Medium** |
| F7  | Weak password policy on admin password reset (≥ 6 chars, no complexity)            | Medium     | Medium | **Medium** |
| F8  | MIME validation relies on client-supplied `file.type`, not magic-bytes             | Medium     | Medium | **Medium** |
| F9  | No rate limiting on any API route (login, enquiry intake, cron, password reset)   | Medium     | Medium | **Medium** |
| F10 | `EMAIL_CREDENTIAL_ENCRYPTION_KEY` not documented in `.env.local.example`           | Medium     | Medium | **Medium** |
| F11 | Raw Supabase error messages returned to clients in several routes                  | Medium     | Low    | **Low**    |
| F12 | `POST /api/logout` has no auth check                                               | Low        | Low    | **Low**    |
| F13 | `JSON.parse` without `try/catch` in `app/api/audit/route.ts`                       | Low        | Low    | **Low**    |
| F14 | Verbose `console.error` of structured server context across many routes            | Low        | Low    | **Low**    |

**Severity ranking, most → least severe:** F1, F2, F4, F3, F5, F6, F7, F8, F9, F10, F11, F12, F13, F14.

---

## 3. Detailed Findings

### F1 — Next.js 16.1.6 carries multiple high-severity CVEs (SSRF, Middleware/Proxy bypass, DoS, smuggling)

- **Description:** `package.json:96` pins `"next": "16.1.6"`. `pnpm audit` reports **12 high** and **multiple moderate/low** advisories against this version, all fixed in `>=16.2.5` (with some fixed in `>=16.1.7`). Notable items:
  - **Server-Side Request Forgery in image optimisation** (high) — `GHSA-…` series, unauthenticated.
  - **Middleware / Proxy bypass in App Router** (multiple highs) — bypass of the entire `proxy.ts` auth refresh + login redirect.
  - **HTTP request smuggling in rewrites** (moderate).
  - **`null` origin can bypass Server Actions CSRF** (moderate).
  - **Cache poisoning in RSC responses** (moderate) and via cache-busting collisions (low).
  - **DoS via image optimisation API and Server Components.**
- **Affected area:** Entire web tier (`next.config.mjs`, every route, `proxy.ts`).
- **Likelihood / Impact / Risk:** High / High / **Critical**
- **Effort estimate:** Low (bump version + run `pnpm install`).
- **Cost implication:** Low — minor-version upgrade within the `16.x` line; no API breakage expected.
- **Scope of fix:** Localised (`package.json` + lockfile + full regression smoke).
- **Recommended fix:**
  1. `pnpm add next@^16.2.5` (or the latest stable `16.x`).
  2. Re-run `pnpm install --frozen-lockfile` in CI to confirm reproducibility.
  3. Re-run `pnpm audit` and verify 12 highs clear.
  4. Smoke-test middleware/proxy auth refresh, image route, and any rewrites.

---

### F2 — Public `POST /api/enquiries` uses service-role client with no Zod validation and no rate limiting

- **Description:** `app/api/enquiries/route.ts:301-579` is the public intake endpoint for the web form and "paste import". It deliberately uses `createServiceClient()` (RLS bypass, `app/api/enquiries/route.ts:306`) because the route is unauthenticated, then writes directly into `customers`, `bookings`, `booking_suites`, `travellers`, `booking_transport_requests`, `booking_vehicle_rental_details`, `quotes`, `quote_line_items` and `audit_logs`. There is **no Zod schema**; fields are coerced ad-hoc (e.g. `body.travellers || []` typed as `any[]` at `:466-467`) and freely stored in JSON columns (`extracted_json` at `:386-402`). No CAPTCHA or rate limit exists for this route, and there is no abuse cap on rows-per-request. Risks:
  - Bulk creation of customer / booking rows by anonymous attackers (storage exhaustion, audit-log flooding, salesperson noise).
  - Schema fields outside the documented form (`extracted_json`, `promotion_code`, `assigned_salesperson_id` is correctly ignored from body — good) can be filled with arbitrary attacker-controlled JSON.
  - The route silently overwrites contact fields on the matched customer (`:339-352`), meaning an attacker who knows a victim's email can rewrite that customer's name, phone, country and title without authentication.
  - The route looks up suppliers, routes and packages by `ilike(name, …)` — not SQL-injectable through Supabase REST, but enables enumeration / fuzzing.
- **Affected area:** `app/api/enquiries/route.ts`, downstream tables `customers`, `bookings`, `travellers`, `booking_*`, `quotes`, `audit_logs`.
- **Likelihood / Impact / Risk:** High / High / **High**
- **Effort estimate:** Medium.
- **Cost implication:** Medium — needs Zod schema, request-size cap, and a rate-limiter (e.g. Upstash, Vercel Edge KV, or a `pg`-backed token bucket).
- **Scope of fix:** Localised to the route + new shared rate-limit helper.
- **Recommended fix:**
  1. Add a strict Zod schema for the public body, with `max()` on all strings, `max(50)` on arrays, and an explicit allowlist of fields. Reject everything else with `400`.
  2. Apply an IP + email rate limit (e.g. 5/min/IP, 20/hour/email) and consider hCaptcha/Turnstile on the form.
  3. On a customer-email collision, **do not overwrite** name/phone/country/title from anonymous input — append to `extracted_json` for review instead, or require a verified email link before mutating the existing row.
  4. Cap `travellers`, `childTravellers`, `transportRequests`, `suiteSelections` array lengths.
  5. Limit `req.json()` size with `request.body` streaming + byte cap.

---

### F3 — No HTTP security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy)

- **Description:** `next.config.mjs` defines only `images.unoptimized = true` and exports no `headers()` function. `proxy.ts` sets no security headers on `NextResponse`. A grep for `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` across the whole repo returns nothing. Combined with finding **F5** (SVG storage uploads) and **F6** (HTML preview), the lack of a CSP magnifies any stored-XSS path into a session-takeover vector.
- **Affected area:** `next.config.mjs`, `proxy.ts`.
- **Likelihood / Impact / Risk:** High / Medium / **High**
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised to `next.config.mjs`.
- **Recommended fix:** Add a `headers()` function to `next.config.mjs`:
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Frame-Options: DENY` (and/or `frame-ancestors 'none'` in CSP)
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - A starter `Content-Security-Policy` covering Supabase + Resend domains. Iterate to remove `'unsafe-inline'` once template rendering (F6) is sanitised.

---

### F4 — Vulnerable transitive dependencies beyond Next.js

- **Description:** `pnpm audit` flags (in addition to F1):
  - `lodash` — Code injection via `_.template` (high) and Prototype Pollution via array (moderate).
  - `vite` — `server.fs.deny` bypass and arbitrary file read (high), path traversal in optimised deps (moderate).
  - `picomatch` — ReDoS via extglob quantifiers (high) and method injection via POSIX classes (moderate).
  - `ws` — Uninitialised memory disclosure, reached via `@supabase/realtime-js` (moderate).
  - `brace-expansion` — Zero-step sequence hang and memory exhaustion (moderate).
  - `postcss` — XSS via unescaped `</style>` in CSS (moderate).
- **Affected area:** Transitive deps inside `pnpm-lock.yaml`; primarily build-time (`vite`, `picomatch`, `postcss`), but `ws` and `lodash` are runtime-reachable through Supabase realtime / any user code that imports `lodash`.
- **Likelihood / Impact / Risk:** Medium / High / **High**
- **Effort estimate:** Medium — requires `pnpm update` and possibly overrides for the deepest transitives.
- **Cost implication:** Low–Medium.
- **Scope of fix:** Localised (`package.json` + lockfile).
- **Recommended fix:**
  1. `pnpm update --recursive` then re-audit.
  2. Pin `pnpm.overrides` for transitive packages that resolve to old versions (e.g. `ws@>=8.20.1`, `lodash@>=4.17.21` if not already, `picomatch@>=4.0.4`, `brace-expansion@>=1.1.13`, `postcss@>=8.4.31`).
  3. Add `pnpm audit --audit-level=high` to CI to prevent regression.

---

### F5 — SVG uploads accepted to public `voucher-assets` bucket (stored XSS surface)

- **Description:** `app/api/voucher-template/upload/route.ts:9,17,24-27` permits `image/svg+xml` as a "direct upload" MIME and writes to the `voucher-assets` Storage bucket, then exposes the public URL (`:84-87`) and stores it on `voucher_template`. SVGs are JavaScript-capable; if the URL is later embedded into voucher HTML (`<img>` is fine, but voucher PDFs / `<object>` / `srcDoc` rendering would execute scripts), and the bucket serves them with `Content-Type: image/svg+xml` on a same-origin path, a malicious admin (or anyone able to write to the bucket) can plant stored XSS. There is also no byte-level validation that the uploaded `image/svg+xml` payload is actually an SVG and does not contain `<script>`/event handlers/`<foreignObject>`.
- **Affected area:** `app/api/voucher-template/upload/route.ts`, Supabase Storage bucket `voucher-assets`, voucher render paths.
- **Likelihood / Impact / Risk:** Medium / High / **High** (admin-only write, but bucket is public-read).
- **Effort estimate:** Low–Medium.
- **Cost implication:** Low.
- **Scope of fix:** Localised to upload route + render path.
- **Recommended fix:**
  1. Drop `image/svg+xml` from `DIRECT_UPLOAD_MIME`; or
  2. Sanitise SVGs server-side with a library that strips `<script>`, event handlers, `xlink:href`, `<foreignObject>`, external references — and re-emit a canonical SVG; and
  3. Serve voucher assets via a domain with `Content-Disposition: attachment` or `Content-Security-Policy: sandbox` headers so any residual script is neutralised.
  4. Verify the bucket is served on a sandbox-domain distinct from the app origin to prevent cookie/auth theft on XSS.

---

### F6 — `dangerouslySetInnerHTML` of template `bodyHtml` in admin Template Preview

- **Description:** `app/app/templates/page.tsx:185`:
  ```tsx
  <div className="text-sm" dangerouslySetInnerHTML={{ __html: preview?.bodyHtml || "" }} />
  ```
  The body originates from the `templates.body_html` column. Editing requires `admin`/`manager` (`app/api/templates/route.ts:43`), so this is admin-against-admin XSS — but those templates are then sent to real customers via email, and any HTML/event-handler payload can be persisted and rendered in the in-app preview to any other privileged user. Note: the *outbound* preview (`components/preview-and-send-dialog.tsx:103-108`) correctly uses `<iframe sandbox="">`, which is the right pattern. Apply the same iframe-sandbox pattern to the template page.
- **Affected area:** `app/app/templates/page.tsx`.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Render the preview in an `<iframe sandbox="" srcDoc={preview.bodyHtml} />` to match `preview-and-send-dialog.tsx`, or sanitise with DOMPurify before rendering. Add a server-side sanitiser when saving template bodies (defence in depth).

---

### F7 — Weak password policy on admin password reset

- **Description:** `app/api/users/[userId]/password/route.ts:58-63` enforces only `newPassword.length >= 6` with no complexity / breached-password check. Modern guidance (NIST SP 800-63B rev 4) is a minimum of 8 characters with a check against a breach corpus, plus no composition rules.
- **Affected area:** `app/api/users/[userId]/password/route.ts`.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**
- **Effort estimate:** Low.
- **Cost implication:** Low (use Supabase Auth's password rules and/or a HaveIBeenPwned `k-anonymity` check).
- **Scope of fix:** Localised.
- **Recommended fix:** Raise minimum to 12 characters, reject the top ~10k common passwords, and prefer pushing the user through Supabase's "send recovery link" flow rather than admins setting plaintext passwords. Also rate-limit this endpoint.

---

### F8 — File-upload MIME validation relies on client-supplied `file.type`

- **Description:** `app/api/voucher-template/upload/route.ts:24-27` decides allowed types from `file.type`, which the browser sets from the file extension and an attacker can forge. There is no magic-byte sniffing.
- **Affected area:** `app/api/voucher-template/upload/route.ts` (and any future upload endpoint that copies this pattern).
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Read the first bytes of the uploaded buffer and validate the signature (`image/png` = `89 50 4E 47`, `image/webp` = `52 49 46 46 … 57 45 42 50`, SVG = XML). Reject mismatches before calling `storage.upload`. Combine with F5 to remove or sanitise SVG entirely.

---

### F9 — No rate limiting anywhere in the application

- **Description:** A repo-wide grep for `rateLimit`, `rate-limit`, `ratelimit` returns nothing. Every endpoint is unthrottled, including:
  - `POST /api/enquiries` (public, see F2)
  - `POST /api/logout` (no auth, see F12)
  - `POST /api/users/[userId]/password` (admin password reset)
  - `POST /api/customers/import` (bulk insert)
  - Login itself (Supabase Auth-side, not in this repo, but worth confirming the Supabase project has anti-bruteforce enabled).
- **Affected area:** All API routes.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**
- **Effort estimate:** Medium.
- **Cost implication:** Low–Medium (Vercel KV / Upstash / Supabase table-based token bucket).
- **Scope of fix:** Cross-cutting — a shared helper in `lib/api/` that wraps `requireUser`/`requireRole`.
- **Recommended fix:** Add a `withRateLimit({ key, limit, window })` helper used by every handler. For unauthenticated endpoints key by IP + path; for authenticated endpoints key by user ID + path. Enforce stricter limits on `/api/enquiries`, password reset, and import endpoints.

---

### F10 — `EMAIL_CREDENTIAL_ENCRYPTION_KEY` not documented in `.env.local.example`

- **Description:** `lib/inbound-email/crypto.ts:6-13` requires `EMAIL_CREDENTIAL_ENCRYPTION_KEY` and throws if missing. The example env file (`.env.local.example`) does not list it. A deployer who follows the example will:
  - Fail to start any IMAP sync (operator pain), **or**
  - Set a placeholder/weak key just to make it run, weakening AES-256-GCM credential at-rest encryption (security pain).
  Also, the current `getCredentialKey()` does `sha256(secret)` — there is no enforced minimum entropy on `secret`, so a misconfigured short string still produces a "valid" 32-byte key without warning the operator.
- **Affected area:** `.env.local.example`, `lib/inbound-email/crypto.ts`.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:**
  1. Add `EMAIL_CREDENTIAL_ENCRYPTION_KEY=<32+ chars of random>` to `.env.local.example` with a comment that it must be a high-entropy secret (e.g. `openssl rand -hex 32`) and must NEVER be rotated without re-encrypting all rows.
  2. In `getCredentialKey()` reject secrets shorter than 32 chars at boot (fail fast).
  3. Confirm `inbound_email_accounts.password_encrypted` rows include the `v1:` prefix and reject legacy/unprefixed values explicitly.

---

### F11 — Raw Supabase error messages returned to clients in several routes

- **Description:** Several routes pass `error.message` straight to the client, e.g. `app/api/cron/pipeline-auto-close/route.ts:58,73,110,122,152,164`, `app/api/users/[userId]/password/route.ts:90`, `app/api/voucher-template/upload/route.ts:81,107`. The shared helper `lib/api/responses.ts:safeSupabaseError()` is the correct pattern (returns generic `"Database error"`, logs the cause server-side) but it is not consistently used. Postgres / Supabase error strings can leak constraint names, RLS policy names, and column names useful for further attack.
- **Affected area:** Multiple API routes.
- **Likelihood / Impact / Risk:** Medium / Low / **Low**
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Cross-cutting — replace `error.message` in JSON responses with calls to `safeSupabaseError(scope, error)`.
- **Recommended fix:** Sweep all `NextResponse.json({ error: …message }, …)` patterns and replace with the existing helper. Add an ESLint rule (or a small custom guard) that forbids returning a Supabase error object directly.

---

### F12 — `POST /api/logout` has no auth check

- **Description:** `app/api/logout/route.ts:5-34` calls `supabase.auth.signOut()` without first verifying the caller. It is functionally idempotent (signing out an already-signed-out session is a no-op), but a CSRF-style cross-site `POST` from an attacker page could log a victim out without their action — a low-impact nuisance that becomes more interesting when combined with the absence of CSRF tokens (F3 / CSP) and the moderate Next.js Server Actions null-origin CSRF advisory in F1.
- **Affected area:** `app/api/logout/route.ts`.
- **Likelihood / Impact / Risk:** Low / Low / **Low**
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Confirm `supabase.auth.getUser()` returns a user before signing out; require `Origin`/`Referer` to match the app's origin; consider a same-site cookie + CSRF token.

---

### F13 — `JSON.parse` without `try/catch` in `app/api/audit/route.ts`

- **Description:** `app/api/audit/route.ts:24` (`parseOptionalJson`) calls `JSON.parse(value) as Json` directly on user input. On malformed input it throws an uncaught `SyntaxError` and Next.js returns a 500 with internal details leaked into server logs. The function is invoked at `:93-95` with query-string values.
- **Affected area:** `app/api/audit/route.ts`.
- **Likelihood / Impact / Risk:** Low / Low / **Low**
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Wrap in `try { return JSON.parse(value) as Json } catch { return null }` and return a `400` with a Zod-style validation message instead of relying on the throw.

---

### F14 — Verbose `console.error` of structured server context

- **Description:** `lib/api/responses.ts:26`, `app/api/users/route.ts:154-169`, `app/api/customers/import/route.ts:68-76`, `app/api/suppliers/helpers.ts` (multiple), `app/api/voucher/generate/route.ts:185`, etc. log structured objects to `console.error`. These are server-only (will appear in Vercel/log drains, not client) and the logs include user IDs, supplier IDs, Supabase error codes — useful for support, but they should not silently grow into a PII or credential sink.
- **Affected area:** Many.
- **Likelihood / Impact / Risk:** Low / Low / **Low**
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Cross-cutting.
- **Recommended fix:** Standardise on a single `serverLog({ scope, level, fields })` helper that explicitly opts in to fields (whitelist), redacts known sensitive keys (`password`, `token`, `authorization`, `password_encrypted`, `service_role`), and gives a single place to swap in structured logging when needed.

---

## 4. Priority Actions

Top items to address first, ranked by **highest risk vs. lowest effort**:

1. **F1 — Bump `next` to `>=16.2.5`** (Low effort, clears 12 high-severity CVEs in one go). Do this **first**.
2. **F4 — `pnpm update --recursive` and add `pnpm.overrides`** for `ws`, `lodash`, `picomatch`, `brace-expansion`, `postcss` (Low effort, clears the rest of the high/moderate dep advisories).
3. **F3 — Add HTTP security headers in `next.config.mjs`** (Low effort, high coverage). Acts as a compensating control for F5/F6.
4. **F2 — Harden `POST /api/enquiries`** with a Zod schema, array length caps, IP+email rate limit, and stop overwriting existing customer fields from anonymous input (Medium effort, high payoff — closes the largest unauthenticated write surface).
5. **F5 — Remove or sanitise SVG uploads** in the voucher-template upload route (Low–Medium effort, eliminates the stored-XSS path the public bucket creates).
6. **F6 — Move template preview into a sandboxed `<iframe srcDoc>`** matching the existing email preview dialog (Low effort, removes admin-against-admin stored XSS).
7. **F8 — Magic-byte file-type validation** in the voucher upload route (pairs naturally with F5).
8. **F7 — Strengthen password policy** on the admin password-reset endpoint and prefer Supabase-issued recovery links.
9. **F9 — Introduce a shared rate-limit helper** and apply it to login, enquiry intake, password reset, and import endpoints.
10. **F10 — Document `EMAIL_CREDENTIAL_ENCRYPTION_KEY`** in `.env.local.example` and enforce a minimum-entropy check at boot.
11. **F11 — Sweep raw error pass-throughs** to use `safeSupabaseError()` everywhere.
12. **F12, F13, F14 — Low-cost cleanups** that can be batched into a single hardening PR.

---

*Report generated by the security-review task. No application code was modified; only this file under `/security-reports/` was written.*
