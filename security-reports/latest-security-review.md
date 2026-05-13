# Security Review — Luxus Sales System

| | |
|---|---|
| **Repository** | `HawkCoding/v0-luxu-sales-system` |
| **Run date** | 2026-05-13 |
| **Branch reviewed** | `claude/friendly-curie-K6iul` |
| **App version** | `2.58` (`lib/version.ts`) |
| **Overall security posture** | **Moderate** (sound foundations, several medium-risk gaps) |
| **Highest-risk issue** | Public enquiry intake route (`/api/enquiries`) has no Zod schema validation, no size limits, and no rate limiting on a `createServiceClient()` (RLS-bypassing) code path |
| **Lowest-risk issue** | PII (email address) logged on user-profile creation error in `app/api/users/route.ts` |
| **Total findings** | 10 |

---

## 1. Summary

- **Total vulnerabilities:** 10 (0 Critical, 2 High, 5 Medium, 3 Low)
- **Highest-risk issue:** *Unvalidated public intake on `/api/enquiries`* — the route uses the service-role client (bypasses RLS), is internet-facing, parses `req.json()` directly without a Zod schema, has no payload-size cap, and no rate limit. This is the single most exposed write path in the app.
- **Lowest-risk issue:** *PII in error log* — `console.error` includes the user email when profile creation fails (`app/api/users/route.ts:154–161`). Admin-only path, low blast radius, but still avoidable.
- **Overall posture:** **Moderate.** Auth (Supabase SSR), role-based access (`requireRole`, `auth_has_role()`), RLS-enabled tables, AES-256-GCM credential encryption for IMAP passwords, and CRON_SECRET-protected cron routes are all in place. The remaining gaps are around input hardening (HTML sanitization, payload limits), missing HTTP security headers, an SVG upload path into a *public* storage bucket, and missing rate limiting on outbound email and public endpoints.

---

## 2. Risk Matrix

| # | Issue | Likelihood | Impact | Risk Level |
|---|---|---|---|---|
| 1 | Public `/api/enquiries` lacks Zod schema, size limits, and rate limiting (uses service-role client) | High | High | **High** |
| 2 | Stored HTML in templates / correspondence rendered unsanitized in PDFs, emails, and UI (`dangerouslySetInnerHTML`) | Medium | High | **High** |
| 3 | SVG uploads accepted into **public** `voucher-assets` storage bucket (stored XSS vector via direct URL) | Low | High | **Medium** |
| 4 | No global HTTP security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy) | High | Medium | **Medium** |
| 5 | No rate limiting on outbound-email endpoint (`/api/correspondence`) or any API route | Medium | Medium | **Medium** |
| 6 | `/api/data` returns large unpaginated aggregate of all customers/bookings/quotes/payments to any authenticated user (consultant included) | Medium | Medium | **Medium** |
| 7 | IMAP-credential encryption key (`EMAIL_CREDENTIAL_ENCRYPTION_KEY`) derived via single SHA-256 with no rotation/versioning beyond `v1` tag | Low | High | **Medium** |
| 8 | `next@16.1.6` and several deps lag latest patches — monitor for newly published advisories | Low | Medium | **Low** |
| 9 | `/api/data` returns empty data instead of `401` for unauthenticated callers (information-disclosure of route existence + relies entirely on RLS) | Low | Low | **Low** |
| 10 | PII (email) included in `console.error` on profile-creation failure | Low | Low | **Low** |

**Most → least severe:** 1, 2, 3, 4, 5, 6, 7, 8, 9, 10.

---

## 3. Detailed Findings

### Finding 1 — Public `/api/enquiries` intake has no schema validation, size cap, or rate limit
- **Description:** `app/api/enquiries/route.ts:300–303` parses `req.json()` directly and proceeds to call `createServiceClient()` (RLS bypass). There is no Zod schema, no `rawText` size limit, no `extractedJson` shape check, and no rate-limit. The route is intentionally unauthenticated.
- **Affected area:** `app/api/enquiries/route.ts` (POST handler, lines ~301–579)
- **Likelihood / Impact / Risk:** High / High / **High**
- **Effort:** Medium
- **Cost:** Low
- **Scope:** Localised
- **Recommended fix:**
  1. Define a Zod schema for the public payload (customer, packageId, dates, suiteSelections, rawText, extractedJson) and reject with 400 on parse failure.
  2. Enforce explicit caps: `rawText` ≤ 50 KB, `extractedJson` size ≤ 50 KB, suiteSelections.length ≤ 20.
  3. Wrap with `request.headers.get('content-length')` rejection and a simple IP/UA rate-limit (e.g. Upstash Ratelimit or Vercel KV) — start at 10/minute/IP.
  4. Keep `createServiceClient()` usage scoped to the minimal writes; avoid passing user-controlled text into any subsequent DB lookup as a `like`/`ilike` pattern.

---

### Finding 2 — Stored HTML rendered without sanitization (templates, correspondence, email previews)
- **Description:** `templates.body_html` and `correspondences.body_html` accept up to 200,000 chars (`app/api/templates/route.ts:11`, `app/api/correspondence/route.ts:46`). The same content is rendered in the UI via `dangerouslySetInnerHTML` (`app/app/templates/page.tsx:185`) and shipped into emails and PDFs. There is no DOMPurify / sanitize-html step.
- **Affected area:** `app/api/templates/route.ts`, `app/api/correspondence/route.ts`, `app/api/quotes/[id]/email-preview/route.ts`, `app/app/templates/page.tsx`, downstream PDF/email renderers in `lib/email/` and `lib/voucher/`
- **Likelihood / Impact / Risk:** Medium (requires manager/admin/consultant write access) / High (stored XSS executing under app origin → can call any API with the caller's cookies, exfiltrate audit logs, escalate via `/api/users`) / **High**
- **Effort:** Low
- **Cost:** Low
- **Scope:** Cross-cutting (all template/correspondence rendering surfaces)
- **Recommended fix:**
  1. Add `sanitize-html` (or `isomorphic-dompurify`) at the API boundary in both `templates` and `correspondence` routes; persist the sanitized form.
  2. Use an explicit allowlist (`p, br, strong, em, ul, ol, li, a[href]`, plus typical email tags), strip `script`, `style`, `iframe`, `object`, event handlers, and `javascript:` URLs.
  3. Add the `Content-Security-Policy: default-src 'none'; img-src https: data:; style-src 'unsafe-inline'` header on `/api/quotes/[id]/email-preview` and other HTML-returning routes.

---

### Finding 3 — SVG upload into a public storage bucket = stored XSS vector
- **Description:** `app/api/voucher-template/upload/route.ts:24–26` accepts `image/svg+xml`. The destination bucket `voucher-assets` is declared `public = true` (`supabase/config.toml` and `supabase/migrations/20260506130000_voucher_assets_bucket.sql:2-17`). SVGs may carry `<script>`/`onload` and execute when fetched directly in a browser. Path is fixed (`logo.svg` / `banner.svg`) so traversal is not an issue, but the public URL is reachable by anyone who knows it.
- **Affected area:** `app/api/voucher-template/upload/route.ts`, `voucher-assets` bucket
- **Likelihood / Impact / Risk:** Low (admin-only upload, but trust-boundary is still inside the org) / High (stored XSS if browser opens the SVG URL on the same origin, or session-cookie theft if served on an auth'd subdomain) / **Medium**
- **Effort:** Low
- **Cost:** Low
- **Scope:** Localised
- **Recommended fix:**
  1. Drop SVG support or sanitize SVG server-side (e.g. `svgo` with `removeScriptElement` + `removeOnEventAttrs`) before upload.
  2. Set explicit `Content-Disposition: attachment` or `Content-Security-Policy: default-src 'none'` response headers when serving the bucket (Supabase Storage transform / edge function), so the file cannot execute as a document.
  3. Alternatively rasterize SVGs to PNG at upload time and store only the raster.

---

### Finding 4 — No HTTP security headers configured
- **Description:** `next.config.mjs` defines only `images.unoptimized = true` and has no `async headers()` block. There is no global CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy`. The middleware-style file `proxy.ts` only handles Supabase token refresh and does not set headers.
- **Affected area:** `next.config.mjs`, `proxy.ts`
- **Likelihood / Impact / Risk:** High / Medium / **Medium**
- **Effort:** Low
- **Cost:** Low
- **Scope:** Localised (one config block, global effect)
- **Recommended fix:** Add a `headers()` config returning at minimum:
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-Frame-Options: DENY`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - A minimal `Content-Security-Policy` (start in `Report-Only` mode, then enforce once stable). Be deliberate about allowing `@vercel/analytics` and Supabase origins.

---

### Finding 5 — No rate limiting on outbound-email and public endpoints
- **Description:** `/api/correspondence` (POST) sends real emails via Resend/SMTP for any authenticated consultant+ user. There is no per-user or per-booking throttle. Same for `/api/enquiries`, `/api/customers/import`, and `/api/voucher/generate`. Any compromised consultant cookie could be used to mail-bomb customers or burn the Resend quota.
- **Affected area:** `app/api/correspondence/route.ts`, `app/api/enquiries/route.ts`, `app/api/customers/import/route.ts`, `app/api/voucher/generate/route.ts`
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**
- **Effort:** Medium
- **Cost:** Low (Vercel KV / Upstash) to Medium (Redis)
- **Scope:** Cross-cutting
- **Recommended fix:** Introduce a shared `lib/api/rate-limit.ts` helper backed by Upstash Ratelimit or Vercel KV. Initial buckets: `/api/correspondence` 20/hr/user/booking, `/api/enquiries` 10/min/IP, login + password endpoints 5/min/IP.

---

### Finding 6 — `/api/data` returns aggregate dataset (customers, bookings, quotes, payments, correspondences, templates) to any authenticated user
- **Description:** `app/api/data/route.ts` issues 13 parallel `select` queries returning the full set of every domain table (audit_logs alone is limited to 1,000 rows; everything else is unbounded). Consultants and managers all receive the same response. Although RLS still applies, a single compromised low-tier account gets the entire pipeline export in one call.
- **Affected area:** `app/api/data/route.ts:27–81`
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**
- **Effort:** Medium
- **Cost:** Low
- **Scope:** Localised (single route, but the client UI depends on its shape — refactor cost is moderate)
- **Recommended fix:**
  1. Add an explicit `requireUser()` 401 guard at the top of the handler (currently it just returns empty arrays).
  2. Paginate: limit `bookings`, `payments`, `correspondences`, `quote_line_items` to e.g. 500 most recent and add a cursor.
  3. Stop returning `rawText` and `extracted_json` in the bookings payload unless explicitly requested — these contain free-form PII pasted from emails.

---

### Finding 7 — IMAP credential encryption key has no rotation path
- **Description:** `lib/inbound-email/crypto.ts:6–14` derives the AES-256-GCM key by SHA-256 hashing `EMAIL_CREDENTIAL_ENCRYPTION_KEY` (no salt, no KDF). The encrypted blob is tagged `v1:` (line 22). There is no second-key handling, no kid index, and no documented rotation procedure. AES-GCM authenticated encryption itself is implemented correctly (random 96-bit IV + authTag).
- **Affected area:** `lib/inbound-email/crypto.ts`, `app/api/settings/inbound-email/accounts/route.ts`
- **Likelihood / Impact / Risk:** Low / High (compromise of one env var → plaintext recovery of every IMAP password) / **Medium**
- **Effort:** Medium
- **Cost:** Low
- **Scope:** Localised (crypto helper + accounts route + a small migration)
- **Recommended fix:**
  1. Switch from raw SHA-256 to a proper KDF (`scrypt`/`argon2id`) with a per-deployment salt, or accept a 32-byte base64 key directly and reject anything shorter.
  2. Add a `kid` field to the blob (`v2:<kid>:<iv>:<tag>:<ct>`) and support a `EMAIL_CREDENTIAL_ENCRYPTION_KEYS` map so rotations are possible without re-encrypting all rows immediately.
  3. Document rotation in `DEVELOPMENT_ENVIRONMENT.md`.

---

### Finding 8 — Dependency freshness / CVE exposure
- **Description:** Pinned versions (from `pnpm-lock.yaml`): `next@16.1.6`, `@supabase/ssr@0.8.0`, `@supabase/supabase-js@2.98.0`, `imapflow@1.3.2`, `mailparser@3.9.8`, `nodemailer@8.0.7` (with `8.0.5` present as a transitive), `resend@6.9.3`, `zod@3.25.76`, `@react-pdf/renderer@4.5.1`. No `pnpm audit` artefact is committed. Notably the Next.js 15.x middleware-auth bypass (CVE-2025-29927) is fixed in this line, but Next.js 16.x has had follow-on patch releases — 16.1.6 may not be the latest.
- **Affected area:** `package.json`, `pnpm-lock.yaml`
- **Likelihood / Impact / Risk:** Low / Medium / **Low**
- **Effort:** Low
- **Cost:** Low
- **Scope:** Localised
- **Recommended fix:** Add `pnpm audit --prod` to CI; subscribe to GitHub Dependabot/Renovate; bump Next.js to the latest 16.x patch on the next release window; pin a single `nodemailer` version (the transitive `8.0.5` suggests a duplicate path).

---

### Finding 9 — `/api/data` does not return `401` for unauthenticated callers
- **Description:** The handler at `app/api/data/route.ts:25` constructs the session client, fetches user via `getUser()`, and even when `user` is null still issues every Supabase query. RLS makes the result empty, but the route quietly returns a 200 with empty arrays. This makes endpoint enumeration easier and relies entirely on RLS being correct.
- **Affected area:** `app/api/data/route.ts:25–81`
- **Likelihood / Impact / Risk:** Low / Low / **Low**
- **Effort:** Low
- **Cost:** Low
- **Scope:** Localised
- **Recommended fix:** Use the shared `requireUser()` helper from `lib/api/auth.ts` and short-circuit with a 401 when there is no user.

---

### Finding 10 — PII (email) included in error logs
- **Description:** `app/api/users/route.ts:154–161` calls `console.error("Failed to create user profile", { userId, email, ... })`. On managed log platforms (Vercel, Supabase) this is retained and may be replicated to third-party log sinks.
- **Affected area:** `app/api/users/route.ts:154–161`
- **Likelihood / Impact / Risk:** Low / Low / **Low**
- **Effort:** Low
- **Cost:** Low
- **Scope:** Localised
- **Recommended fix:** Replace `email` with a hash or with `email.split('@')[1]` (domain only) for diagnostic value without storing the identifier.

---

## 4. Priority Actions

Ordered by *highest risk vs lowest effort win*:

1. **(High risk, low effort)** Add Zod validation + size caps + rate-limit to `/api/enquiries` (Finding 1).
2. **(High risk, low effort)** Sanitize HTML at write-time for `templates.body_html` and `correspondences.body_html`; treat any client-supplied HTML as untrusted (Finding 2).
3. **(Medium risk, low effort)** Add global security headers (`Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, baseline CSP) via `next.config.mjs` (Finding 4).
4. **(Medium risk, low effort)** Either drop SVG support in voucher uploads or sanitize/rasterize SVGs server-side, and serve the public bucket with `Content-Disposition: attachment` (Finding 3).
5. **(Medium risk, medium effort)** Introduce a shared rate-limit helper and apply it to `/api/correspondence`, `/api/enquiries`, `/api/customers/import`, `/api/voucher/generate` (Finding 5).
6. **(Medium risk, medium effort)** Paginate `/api/data`, strip `rawText` / `extracted_json`, and add an explicit 401 guard (Findings 6 and 9).
7. **(Medium risk, medium effort)** Harden `lib/inbound-email/crypto.ts` with a real KDF and a kid-tagged blob format to enable key rotation (Finding 7).
8. **(Low risk, low effort)** Wire `pnpm audit --prod` into CI and bump Next.js to the latest 16.x patch (Finding 8).
9. **(Low risk, low effort)** Replace email PII with hash/domain in error logs (Finding 10).

---

## Appendix — Scan Coverage Notes

- `proxy.ts` (Next.js 16 proxy convention, the replacement for `middleware.ts`) refreshes Supabase tokens and redirects `/login` for already-authenticated users. Route-level auth is correctly enforced inside `app/app/layout.tsx` (server layout) and inside individual API routes via `requireUser()` / `requireRole()` in `lib/api/auth.ts`.
- All cron routes (`/api/cron/email-sync`, `/api/cron/pipeline-auto-close`) verify `Authorization: Bearer ${CRON_SECRET}` before doing work — no anonymous access.
- `createServiceClient()` usage is reviewed and justified everywhere it appears (`/api/enquiries`, `/api/users`, `/api/users/[userId]`, `/api/users/[userId]/password`, `auth/callback`, `cron/pipeline-auto-close`, inbound-email helpers).
- 26 Postgres tables have RLS enabled; policies use `auth_has_role()` with explicit role arrays. One `using (true)` policy exists on `profiles` for `supabase_auth_admin` only — intentional, required by the `custom_access_token_hook`.
- Two storage buckets: `voucher-assets` (public, write restricted to admin — see Finding 3) and `vouchers` (private — OK).
- No plaintext secrets found in tracked files. `.env.local` and `.env.local.example` are correctly handled.
- IMAP / SMTP passwords are stored encrypted via `lib/inbound-email/crypto.ts`; no plaintext credentials in the database (see Finding 7 for key-management hardening).
- No SQL injection vectors observed — all data access goes through the `@supabase/supabase-js` query builder with parameterised filters.
- `dangerouslySetInnerHTML` appears in two places: `components/ui/chart.tsx:83` (safe, renders a static CSS string the component itself generates) and `app/app/templates/page.tsx:185` (unsafe — see Finding 2).
