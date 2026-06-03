# Security Review — Luxus Sales System

| Field | Value |
|---|---|
| **Repository** | `hawkcoding/v0-luxu-sales-system` |
| **Run date** | 2026-06-03 |
| **Branch reviewed** | `claude/friendly-curie-LpSHf` |
| **Total findings** | 13 |
| **Overall security posture** | **Moderate** |
| **Highest-risk issue** | Permissive RLS policies (`USING (true)`) on all core business tables |
| **Lowest-risk issue** | Verbose `console.error` PII logging in user-management flows |

---

## 1. Summary

The application has a coherent baseline (server-side Supabase clients separated by purpose, Zod validation on most internal routes, AES-256-GCM encryption for SMTP passwords, cron secret gating, signed URLs for storage downloads, a session-aware proxy, and an admin/manager role check helper). However, two structural weaknesses lower the overall posture from Strong to Moderate:

1. The **core business tables (`bookings`, `customers`, `payments`, `quotes`, `quote_line_items`, `documents`, `correspondences`, `audit_logs`, …) rely on RLS policies that resolve to `USING (true)` / `WITH CHECK (true)` for the `authenticated` role**. Authorization is effectively enforced only at the API layer; any authenticated user (including the `readonly` role) can read, write, or delete every business record by calling Supabase directly from the browser with their session JWT.
2. The **public enquiry intake `POST /api/enquiries` uses the service-role client without Zod validation, without rate limiting, and without CAPTCHA**, while the `/api/data` route lacks an explicit auth gate.

Other findings cover weak password policy, missing security response headers, SVG upload XSS surface, `dangerouslySetInnerHTML` on stored template HTML, info-leaking error responses, and minor issues with hard-coded dev credentials and missing body-size limits.

- **Total vulnerabilities:** 13
- **Highest-risk:** Permissive RLS policies on core business tables — any authenticated user (incl. `readonly`) can fully read/write/delete all business data via direct Supabase JS calls, completely bypassing API-layer authorization.
- **Lowest-risk:** Verbose `console.error` PII logging (email + DB error details) in `app/api/users/route.ts` — only visible in server logs.

---

## 2. Risk Matrix

| # | Issue | Likelihood | Impact | Risk Level |
|---|---|---|---|---|
| 1 | Permissive RLS (`USING (true)`) on `bookings`, `customers`, `payments`, `quotes`, `documents`, `audit_logs`, … | High | High | **Critical** |
| 2 | Public `POST /api/enquiries` uses service-role client with no Zod schema / no rate limit | High | High | **High** |
| 3 | Missing HTTP security response headers (CSP, X-Frame-Options, HSTS, Referrer-Policy, X-Content-Type-Options) | High | Medium | **High** |
| 4 | Weak password policy — 6-character minimum, no complexity requirements | Medium | High | **High** |
| 5 | No rate limiting on any API route (login, password reset, public enquiry intake, cron endpoints) | High | Medium | **High** |
| 6 | `GET /api/data` has no explicit auth gate — defends only via RLS, which is permissive | Medium | High | **High** |
| 7 | SVG file upload accepted as voucher asset and served via public URL (stored XSS surface) | Low | Medium | **Medium** |
| 8 | `dangerouslySetInnerHTML` renders stored template `bodyHtml` without sanitisation | Low | Medium | **Medium** |
| 9 | Diagnostic error payload (`phase`, `traceId`, DB `code`/`hint`/`details`) returned when `NODE_ENV !== "production"` | Medium | Low | **Medium** |
| 10 | Consultant RLS policy allows `SELECT` on `salesperson_credentials.encrypted_password` column | Low | Medium | **Medium** |
| 11 | Hard-coded dev quick-login credentials (`password123`) bundled into `app/login/page.tsx` | Low | Medium | **Medium** |
| 12 | No request body-size limit on JSON/form routes other than file upload | Medium | Low | **Low** |
| 13 | Verbose `console.error` logs include PII (target email, profile error code/hint/details) | Medium | Low | **Low** |

---

## 3. Detailed Findings

### Finding 1 — Permissive RLS on core business tables (Critical)
- **Description:** `supabase/migrations/20260308095136_remote_schema.sql` defines policies such as `CREATE POLICY "biz_select" ON "public"."customers" FOR SELECT TO "authenticated" USING (true);` and parallel `biz_insert` / `biz_update` / `biz_delete` policies for `bookings`, `customers`, `payments`, `quotes`, `quote_line_items`, `documents`, `correspondences`, `itineraries`, `booking_suites`, `travellers`, `pipeline_history`, `audit_logs`, etc. The schema also issues `GRANT ALL ON TABLE … TO anon, authenticated` (e.g. `20260308095136_remote_schema.sql:1820+`). All authorization is therefore enforced only at the Next.js API layer.
- **Affected area:** `supabase/migrations/20260308095136_remote_schema.sql` lines ~1176–1620 (RLS enablement + `biz_*` policies); every table with a `biz_*` policy.
- **Likelihood / Impact / Risk:** High / High / **Critical**
- **Effort estimate:** **High** — re-author RLS policies per table to reflect actual role rules (e.g. `readonly` cannot write, only owners can read certain rows) and run a full regression of API + UI flows.
- **Cost implication:** **High** — touches all data access.
- **Scope of fix:** **Cross-cutting** (SQL migrations + tests + possibly client-side queries).
- **Recommended fix:**
  1. Replace each `USING (true)` / `WITH CHECK (true)` policy with role-aware conditions modelled on the existing `auth_has_role(...)` helper already used elsewhere (e.g. `supabase/migrations/20260312160000_add_missing_supplier_reference_tables.sql:107`).
  2. At minimum: deny writes for `readonly`; require `admin|manager` for `DELETE` on financial tables (`payments`, `quotes`, `bookings`); scope `audit_logs` `SELECT` to `admin|manager`.
  3. Add Vitest / pgTAP coverage that authenticates as each role and asserts allowed/denied operations.
  4. Audit the `GRANT ALL … TO anon` statements and downgrade `anon` to the minimum needed (typically just lookup tables used by the public enquiry form).

---

### Finding 2 — Public enquiry intake bypasses RLS with no Zod validation or rate limit (High)
- **Description:** `app/api/enquiries/route.ts:410-704` (`POST`) explicitly instantiates `createServiceClient()` because it is a public intake endpoint. The body is read with `await req.json()` and consumed as `body.<field>` directly — there is no Zod schema. Arbitrary clients can therefore insert `customers`, `bookings`, `booking_suites`, `travellers`, `booking_transport_requests`, `booking_vehicle_rental_details`, `quotes`, `quote_line_items`, and `audit_logs` rows with attacker-controlled values, subject only to ad-hoc per-field coercion (e.g. `body.noOfAdults ?? 1`). The handler is also invoked unauthenticated and is not rate-limited.
- **Affected area:** `app/api/enquiries/route.ts:410-704` (entire `POST` handler).
- **Likelihood / Impact / Risk:** High / High / **High**
- **Effort estimate:** **Medium**
- **Cost implication:** **Medium**
- **Scope of fix:** **Localised** to the enquiry route, plus a shared rate-limit utility.
- **Recommended fix:**
  1. Define a strict Zod schema for the public payload (typed `email`, length-bounded strings, bounded integers for `noOfAdults` / `noOfChildren` / `noOfSuites` / `extraNights`, capped array sizes for `travellers` / `childTravellers` / `transportRequests` / `suiteSelections`).
  2. Validate before any DB write; return `400` on failure.
  3. Add IP + email rate limiting (e.g. Upstash Redis token bucket) and CAPTCHA on the public form.
  4. Move any nested mutation logic into stored procedures with `SECURITY DEFINER` so the service-role client is no longer needed at the request boundary, or wrap the insert sequence in a single RPC.

---

### Finding 3 — Missing HTTP security response headers (High)
- **Description:** `next.config.mjs` only sets `images.unoptimized: true`; there is no `headers()` block, and no Content-Security-Policy, X-Frame-Options, Strict-Transport-Security, Referrer-Policy, X-Content-Type-Options, or Permissions-Policy is sent. `proxy.ts` is purely auth-related. Pages are therefore embeddable in iframes (clickjacking), CSP-less (broader XSS blast radius), and HSTS-less.
- **Affected area:** `next.config.mjs`, `proxy.ts`.
- **Likelihood / Impact / Risk:** High / Medium / **High**
- **Effort estimate:** **Low**
- **Cost implication:** **Low**
- **Scope of fix:** **Localised** (one config file).
- **Recommended fix:** Add an `async headers()` function to `next.config.mjs` returning, at minimum, `Content-Security-Policy` (with nonce/hash for inline scripts), `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`), `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.

---

### Finding 4 — Weak password policy (High)
- **Description:** `app/api/users/route.ts:20` and `app/api/users/[userId]/password/route.ts:59` enforce only `min(6)` characters with no complexity or breach-list check. Admin-created and admin-reset passwords can be e.g. `123456`, `aaaaaa`, etc. This contradicts modern NIST SP 800-63B guidance (≥8 chars, optional ≥12, breached-password rejection).
- **Affected area:** `app/api/users/route.ts:20`, `app/api/users/[userId]/password/route.ts:59`, plus client-side reset flow.
- **Likelihood / Impact / Risk:** Medium / High / **High**
- **Effort estimate:** **Low**
- **Cost implication:** **Low**
- **Scope of fix:** **Localised** (two route files + one shared validator).
- **Recommended fix:** Centralise a `passwordSchema` (e.g. `z.string().min(12).max(128).refine(notInCommonBreachList)`), enforce it in both routes, and surface the rule in the UI. Optionally call HaveIBeenPwned k-anonymity API server-side.

---

### Finding 5 — No rate limiting on any API route (High)
- **Description:** A grep for `rateLimit|throttle|RATELIMIT` across `app/`, `lib/`, and `proxy.ts` returns no matches. Login (`/api/login` via Supabase client), `requestPasswordReset`, `POST /api/enquiries`, `POST /api/customers/import`, `POST /api/users` and the cron routes have no in-app rate limiting. The cron routes rely solely on the static `CRON_SECRET` bearer token (`app/api/cron/*/route.ts`) — guessing/leaking it grants unlimited backup / data-sync triggering.
- **Affected area:** All API routes, especially `app/api/enquiries/route.ts`, `app/api/customers/import/route.ts`, `app/api/users/[userId]/password/route.ts`, `app/api/cron/**`.
- **Likelihood / Impact / Risk:** High / Medium / **High**
- **Effort estimate:** **Medium**
- **Cost implication:** **Low-Medium** (Upstash free tier covers most use cases).
- **Scope of fix:** **Cross-cutting** (shared middleware).
- **Recommended fix:** Add a shared `withRateLimit(key, opts)` wrapper backed by Upstash Redis / Vercel KV. Apply per-IP + per-user (or per-email) buckets on the public form, login, password-reset and import endpoints. For cron routes, restrict to Vercel cron IPs and rotate `CRON_SECRET` periodically.

---

### Finding 6 — `GET /api/data` has no explicit auth gate (High)
- **Description:** `app/api/data/route.ts:28-82` reads `user` via `auth.getUser()` only to determine `canReadAuditLogs`; it never returns `401` if `user` is null. The endpoint fans out queries for `customers`, `bookings`, `profiles`, `payments`, `quotes`, etc. Because the underlying RLS policies are `USING (true)` (Finding 1), an unauthenticated request still goes through but currently returns rows only if `anon` has matching grants — combined with the broad `GRANT ALL … TO anon` in the schema this is too close to silently exposing the whole dataset.
- **Affected area:** `app/api/data/route.ts:28-82`.
- **Likelihood / Impact / Risk:** Medium / High / **High**
- **Effort estimate:** **Low**
- **Cost implication:** **Low**
- **Scope of fix:** **Localised**.
- **Recommended fix:** Add `if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })` immediately after `getUser()`. Also consider replacing this “load everything” endpoint with paginated, scoped endpoints to limit blast radius if RLS is misconfigured.

---

### Finding 7 — SVG upload as voucher asset → stored XSS (Medium)
- **Description:** `app/api/voucher-template/upload/route.ts:24-77` accepts `image/svg+xml` for both `logo` and `banner` kinds, then stores it in the `voucher-assets` bucket and returns the public URL via `supabase.storage.from(BUCKET).getPublicUrl(path)`. SVGs may embed `<script>` / `onload` handlers; if an admin (or any user navigating to the public URL) opens the asset URL directly, JS executes in the Supabase storage origin. The route is admin-only (so risk is reduced), but it is still a stored XSS surface and the public URL is reachable without auth.
- **Affected area:** `app/api/voucher-template/upload/route.ts:9`, `:24-27`.
- **Likelihood / Impact / Risk:** Low / Medium / **Medium**
- **Effort estimate:** **Low**
- **Cost implication:** **Low**
- **Scope of fix:** **Localised**.
- **Recommended fix:** Either (a) drop SVG support and accept only PNG/WebP, or (b) sanitize uploaded SVGs server-side with DOMPurify (Node) before upload, and add `Content-Disposition: attachment` / `Content-Security-Policy: sandbox` response headers for the bucket. Also serve assets via signed URLs rather than `getPublicUrl()`.

---

### Finding 8 — `dangerouslySetInnerHTML` on stored template HTML (Medium)
- **Description:** `app/app/templates/page.tsx:185` renders `preview?.bodyHtml` via `dangerouslySetInnerHTML` with no sanitisation. Template bodies are admin/manager-managed and stored in `templates.body_html`. A compromised manager account (or a script via Finding 1’s RLS) could persist HTML that executes in an admin’s browser session, achieving privilege escalation.
- **Affected area:** `app/app/templates/page.tsx:185`.
- **Likelihood / Impact / Risk:** Low / Medium / **Medium**
- **Effort estimate:** **Low**
- **Cost implication:** **Low**
- **Scope of fix:** **Localised**.
- **Recommended fix:** Sanitize with DOMPurify (`isomorphic-dompurify`) before injection, or render the preview inside a sandboxed `<iframe sandbox>`. Reject `<script>` and event handlers on save.

---

### Finding 9 — Info-leaking error responses in non-production (Medium)
- **Description:** `app/api/customers/import/route.ts:66-89` returns a body containing `phase`, `traceId`, and DB error `details` whenever `process.env.NODE_ENV !== "production"`. If `NODE_ENV` is unset (default `undefined`) on a deployment target, this branch leaks internal phase labels and Postgres error metadata (which can disclose table names, FK names, and column hints).
- **Affected area:** `app/api/customers/import/route.ts:51-90`, `app/api/customers/import/route.ts:66`.
- **Likelihood / Impact / Risk:** Medium / Low / **Medium**
- **Effort estimate:** **Low**
- **Cost implication:** **Low**
- **Scope of fix:** **Localised**.
- **Recommended fix:** Flip the gate to opt-in via a deliberate env (e.g. `process.env.ENABLE_VERBOSE_ERRORS === "true"`) and never enable in production. Strip Postgres `hint` and `details` server-side before returning to the client.

---

### Finding 10 — Consultant RLS can `SELECT` `encrypted_password` (Medium)
- **Description:** `supabase/migrations/20260516140000_salesperson_credentials.sql:47-60` grants consultants `SELECT` on their own row of `salesperson_credentials`, which includes the `encrypted_password` column. While the value is AES-256-GCM encrypted (`lib/inbound-email/crypto.ts`), a compromised consultant browser/session can exfiltrate ciphertext. If `EMAIL_CREDENTIAL_ENCRYPTION_KEY` ever leaks (e.g. via Finding 9 / log capture / misconfigured envs), the plaintext SMTP password is recoverable. API responses already strip the column (`SAFE_COLUMNS` in `app/api/settings/salesperson-credentials/route.ts:53`), so the row exposure is purely via direct Supabase JS calls.
- **Affected area:** `supabase/migrations/20260516140000_salesperson_credentials.sql:47-60`.
- **Likelihood / Impact / Risk:** Low / Medium / **Medium**
- **Effort estimate:** **Low**
- **Cost implication:** **Low**
- **Scope of fix:** **Localised**.
- **Recommended fix:** Either (a) restrict the consultant SELECT policy to a column-list view that excludes `encrypted_password`, or (b) move `encrypted_password` into a separate table accessible only to `service_role`. Defense-in-depth: rotate the encryption key on a schedule and store it in a KMS rather than a plain env var.

---

### Finding 11 — Hard-coded dev quick-login credentials (Medium)
- **Description:** `app/login/page.tsx:16-23` hard-codes five staff email addresses and the password `password123` in client code. The button is gated on `process.env.NODE_ENV === "development"`, but Next.js will still bundle the constants into the client chunk. If a production build is ever produced without `NODE_ENV=production` (e.g. a misconfigured Vercel env), the credentials and the auto-login control ship to end-users.
- **Affected area:** `app/login/page.tsx:14-100`.
- **Likelihood / Impact / Risk:** Low / Medium / **Medium**
- **Effort estimate:** **Low**
- **Cost implication:** **Low**
- **Scope of fix:** **Localised**.
- **Recommended fix:** Move the dev quick-login control behind an explicit `NEXT_PUBLIC_DEV_QUICK_LOGIN_ENABLED` flag that is only set in `.env.development`; remove hard-coded emails / passwords from the source and require them to be configured via env or `localStorage`. Tree-shake the entire block out of production via a `if (process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN === "1")` guard.

---

### Finding 12 — No explicit request body-size limit (Low)
- **Description:** Routes such as `app/api/enquiries/route.ts`, `app/api/customers/import/route.ts` and `app/api/jobs/[id]/route.ts` call `await req.json()` directly without any maximum body size. Only `app/api/documents/upload/route.ts:65` enforces a size cap (from `getAttachmentMaxSizeMb`). Next.js defaults differ between Node and Edge runtimes and may grow over time, leaving a generic DoS / memory-exhaustion vector.
- **Affected area:** Most JSON-accepting API routes.
- **Likelihood / Impact / Risk:** Medium / Low / **Low**
- **Effort estimate:** **Low**
- **Cost implication:** **Low**
- **Scope of fix:** **Cross-cutting** (small shared helper).
- **Recommended fix:** Wrap `req.json()` in a helper that checks `Content-Length` against a per-route cap (e.g. 64 KiB for forms, 2 MiB for bulk import) and rejects with `413` if exceeded.

---

### Finding 13 — Verbose `console.error` PII in user-management flows (Low)
- **Description:** `app/api/users/route.ts:154-170` logs `userId`, `email`, Postgres error `code`, `details`, and `hint` to stdout on profile-creation failure. Similar logs exist for backup, voucher, customer import. These are captured by the hosting platform (Vercel) and accessible to anyone with deployment access. The information is not exposed to the client but constitutes PII processing that should be intentional.
- **Affected area:** `app/api/users/route.ts:154-170`, scattered `console.error` calls in `app/api/**/route.ts`.
- **Likelihood / Impact / Risk:** Medium / Low / **Low**
- **Effort estimate:** **Low**
- **Cost implication:** **Low**
- **Scope of fix:** **Cross-cutting**.
- **Recommended fix:** Route diagnostics through a structured logger that redacts emails by default (`email -> hash(email)`) and document the retention policy. Avoid logging raw DB `hint` / `details` in production paths.

---

## 4. Priority Actions

Top issues to address first — sorted by **risk vs. effort**:

1. **Finding 3 — Add security response headers** *(High risk, Low effort)* — biggest win for least work. Edit `next.config.mjs` to ship CSP / X-Frame-Options / HSTS / Referrer-Policy / X-Content-Type-Options.
2. **Finding 6 — Add explicit `401` to `GET /api/data`** *(High risk, Low effort)* — one-line guard; eliminates an entire unauthenticated read pathway.
3. **Finding 4 — Raise password minimum to 12 chars + breach check** *(High risk, Low effort)* — two schemas to update, one shared validator.
4. **Finding 2 — Zod-validate the public `POST /api/enquiries` payload** *(High risk, Medium effort)* — bounded schema + array size caps before reaching the DB.
5. **Finding 5 — Add IP+email rate limiting to public/auth endpoints** *(High risk, Medium effort)* — shared `withRateLimit` wrapper, applied to login, password-reset, `/api/enquiries`, `/api/customers/import`, cron.
6. **Finding 1 — Rewrite permissive RLS policies** *(Critical risk, High effort)* — this is the largest piece of work but the single most important architectural fix. Treat it as a phased programme: lock down writes first (`readonly` deny), then financial deletes, then `audit_logs` reads, then per-row ownership rules.
7. **Findings 7, 8, 11 — Quick UI/upload hygiene** *(Medium risk, Low effort)* — drop SVG support / sanitize template HTML / pull dev credentials out of the bundle.
8. **Findings 9, 10, 12, 13** — clean up as part of routine maintenance.

---

*End of report.*
