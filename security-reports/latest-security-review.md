# Security Review — Luxus Sales System

| Field | Value |
| --- | --- |
| Repository | `hawkcoding/v0-luxu-sales-system` |
| Run date | 2026-06-02 |
| Branch reviewed | `claude/friendly-curie-aY0VS` |
| App version | `3.22` (`lib/version.ts`) |
| Total findings | 13 |
| Highest-risk issue | **F-01 — Unauthenticated `/api/enquiries` POST overwrites arbitrary customer records via `linkedCustomerId`** |
| Lowest-risk issue | **F-13 — `images.unoptimized = true` in `next.config.mjs`** |
| Overall security posture | **Moderate** (strong auth scaffolding and Zod usage in most routes, but the public enquiry intake is a critical exposure and several routes rely on RLS instead of explicit auth checks). |

---

## 1. Summary

The codebase generally follows the security guidance in `CLAUDE.md` — role-gated admin routes, Zod validation on most boundaries, session-scoped Supabase clients for normal traffic, AES-GCM credential encryption — but a small number of high-impact gaps need attention:

- A **public enquiry intake** (`POST /api/enquiries`) bypasses RLS via the service role, performs **no Zod validation**, accepts an attacker-controlled `linkedCustomerId`, and uses that ID to **update existing customer rows** with attacker-supplied PII. This is the single highest-risk issue.
- The customer/audit search endpoints build PostgREST `.or()` filters via string interpolation. Escaping is incomplete (`(`, `)`, `.` are not escaped), which permits **PostgREST filter injection**.
- The **`POST /api/audit`** endpoint accepts arbitrary `entity_type`, `entity_id`, `action`, `before_json`, `after_json`, `meta_json` from any authenticated user with no role gate, allowing **audit log tampering / fabrication**.
- Cron secret comparisons use **non-constant-time `!==`**.
- An `/auth/callback?next=…` parameter is only validated with `startsWith("/")`, allowing protocol-relative inputs that — while currently neutralised by the same-origin concatenation — are a fragile defence.
- The shared `/api/data` endpoint relies entirely on RLS rather than returning 401 for unauthenticated callers.
- The template preview renders editor-controlled HTML with `dangerouslySetInnerHTML`, creating a stored-XSS path against admins.
- Several `grant all … to anon` statements on new voucher tables are a footgun if RLS is ever disabled.
- Password floor is **6 characters** in the admin user-create / reset flows.
- No HTTP security headers (CSP, HSTS, frame-ancestors, etc.) are configured.

---

## 2. Risk Matrix

| ID  | Issue | Likelihood | Impact | Risk |
| --- | --- | --- | --- | --- |
| F-01 | Unauthenticated public enquiry intake overwrites arbitrary customer rows via `linkedCustomerId`, no Zod, no rate limit | High | High | **Critical** |
| F-02 | PostgREST `.or()` filter injection in customer + audit search | Medium | High | **High** |
| F-03 | `POST /api/audit` lets any authenticated user fabricate arbitrary audit entries | Medium | High | **High** |
| F-04 | Stored XSS via unsanitised template preview (`dangerouslySetInnerHTML`) | Low | High | **Medium** |
| F-05 | `/api/data` does not return 401 — relies entirely on RLS | Low | High | **Medium** |
| F-06 | Non-constant-time `CRON_SECRET` comparison in five cron routes | Low | Medium | **Medium** |
| F-07 | Weak 6-character password floor on user create / reset | Medium | Medium | **Medium** |
| F-08 | `auth/callback` `next` redirect: only `startsWith("/")` check; protocol-relative inputs slip through validation | Low | Medium | **Low–Medium** |
| F-09 | `grant all … to anon` on `booking_package_selections`, `vouchers`, `voucher_service_blocks` | Low | High | **Medium** |
| F-10 | No HTTP security response headers (CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy) | Medium | Medium | **Medium** |
| F-11 | Dev quick-login button ships real staff emails inside the client bundle (gated only by `NODE_ENV`) | Low | Low | **Low** |
| F-12 | Document signed URLs have a 1-hour expiry and no row-level authz check beyond bucket policy | Low | Medium | **Low–Medium** |
| F-13 | `next.config.mjs` sets `images.unoptimized: true`, opting out of Next’s built-in image safeguards | Low | Low | **Low** |

Ranked most → least severe: **F-01 → F-02 → F-03 → F-09 → F-10 → F-04 → F-05 → F-06 → F-07 → F-12 → F-08 → F-11 → F-13.**

---

## 3. Detailed Findings

### F-01 — Public enquiry intake overwrites arbitrary customer rows (Critical)
- **Affected area:** `app/api/enquiries/route.ts` `POST` handler and `resolveEnquiryCustomer` (≈ lines 410–700).
- **Description:** The route is intentionally public (no `auth.getUser()` gate) and uses `createServiceClient()` to bypass RLS. The request body is **never validated with Zod** — the project rules in `CLAUDE.md` require it. The function reads `body.linkedCustomerId` as an unsigned UUID and, if matched, **updates** the corresponding `customers` row with attacker-supplied `first_name`, `last_name`, `phone`, `country`, `title`. Even without `linkedCustomerId`, an email lookup against an existing customer triggers the same overwrite. The route also inserts attacker-controlled `bookings`, `travellers`, `booking_transport_requests`, `audit_logs`, and `quotes` rows. There is no rate limit, no CAPTCHA, no shared-secret check, and no origin/CSRF protection.
- **Concrete impact:** Anonymous user → POST `{ "linkedCustomerId": "<known-uuid>", "name": "X", "surname": "Y", "contactNumber": "…", "email": "victim@x" }` rewrites that customer’s identity fields. Combined with `audit_logs.actor` defaulting to `"consultant"` / `"system"`, the attacker can also forge plausible-looking audit trail entries. Public enumeration of any customer record is also possible by spraying emails.
- **Likelihood / Impact / Risk:** High / High / **Critical**.
- **Effort:** Medium. **Cost:** Medium. **Scope:** Localised (single route + `resolveEnquiryCustomer`).
- **Recommended fix:**
  1. Add a Zod schema for the full POST body; reject unknown fields with `.strict()`.
  2. Remove the `linkedCustomerId` overwrite path (or require an authenticated session before honouring it).
  3. Do **not** update existing customers from this public route — only insert when the email is brand-new; for matches, attach the booking to the existing customer without mutating their profile.
  4. Add an outer rate limit (e.g. by IP + email) and a CAPTCHA / hCaptcha gate for the web form path.
  5. Set the `actor` on the audit log to a fixed string like `"public_intake"` instead of trusting `body.rawText`.

---

### F-02 — PostgREST `.or()` filter injection in customer + audit search (High)
- **Affected area:** `app/api/customers/route.ts:46-48`, `lib/audit.ts:252-256`.
- **Description:** Both routes interpolate user input into a `.or(...)` filter after escaping only `%`, `_`, and `,`. PostgREST’s filter grammar treats `(`, `)`, `.`, and `:` as structural tokens. A search like `foo),actor.eq.admin)(or(id.is.null` can break out of the intended `ilike` value and add additional disjuncts, e.g. enumerating audit rows that do not match the user’s filter or causing the parser to widen the query unexpectedly.
- **Likelihood / Impact / Risk:** Medium / High / **High**.
- **Effort:** Low. **Cost:** Low. **Scope:** Localised (2 files).
- **Recommended fix:** Either (a) replace `.or(...)` with a Postgres-side full-text/text-search view that takes a single bound argument, or (b) reject any search input that contains `(`, `)`, `.`, `:` after trimming, or URL-encode/percent-escape those characters before interpolation. Add a unit test that asserts `foo)` is rejected or correctly escaped.

---

### F-03 — `POST /api/audit` allows arbitrary audit log fabrication (High)
- **Affected area:** `app/api/audit/route.ts` `POST` handler.
- **Description:** Any authenticated user (including `readonly`) can write an arbitrary row to `audit_logs` with any `entity_type`, `entity_id`, `action`, `before_json`, `after_json`, `meta_json`. The route only authenticates the user; it does not check `clearance_level` and does not constrain the action/entity strings. This breaks the integrity of the audit trail (other code paths surface audit logs to managers/admins as evidence) and enables both log flooding and impersonation of system actions like `password_reset`, `role_changed`, `user_deleted`.
- **Likelihood / Impact / Risk:** Medium / High / **High**.
- **Effort:** Low. **Cost:** Low. **Scope:** Localised.
- **Recommended fix:** Either delete this POST endpoint entirely (audit writes already flow through `writeAuditLog` server-side) or restrict it to `admin` / `manager`, lock `action` to an allowlist, and verify that `entity_id` belongs to a record the caller is permitted to act on.

---

### F-04 — Stored XSS via template preview (Medium)
- **Affected area:** `app/app/templates/page.tsx:185` — `<div dangerouslySetInnerHTML={{ __html: preview?.bodyHtml || "" }} />`.
- **Description:** Email template bodies are admin-editable HTML and are rendered raw in the preview dialog. A malicious or compromised editor can store a `<script>` (or `<img onerror=…>`) payload that runs in the admin’s browser the next time they preview the template, hijacking the admin session.
- **Likelihood / Impact / Risk:** Low / High / **Medium**.
- **Effort:** Low. **Cost:** Low. **Scope:** Localised.
- **Recommended fix:** Sanitize `bodyHtml` with DOMPurify (or render inside a sandboxed `<iframe sandbox>` with no script permissions). Combine with the CSP from F-10.

---

### F-05 — `/api/data` returns 200 for unauthenticated callers (Medium)
- **Affected area:** `app/api/data/route.ts`.
- **Description:** The route calls `supabase.auth.getUser()` but does not branch on the result. Anonymous requests therefore execute every `select` against the session client and rely solely on RLS to return empty arrays. If a single RLS policy regresses, the entire dataset leaks via one endpoint. The route should fail closed.
- **Likelihood / Impact / Risk:** Low / High / **Medium**.
- **Effort:** Low. **Cost:** Low. **Scope:** Localised.
- **Recommended fix:** Return `401` immediately when `user` is null, and consider also requiring `profile.is_active === true`.

---

### F-06 — Non-constant-time `CRON_SECRET` comparison (Medium)
- **Affected area:** `app/api/cron/{backup,email-sync,payment-reminders,pipeline-auto-close,quote-follow-ups}/route.ts`.
- **Description:** Each route compares `authHeader !== \`Bearer ${process.env.CRON_SECRET}\``. JavaScript string `!==` short-circuits on first byte mismatch, which is theoretically observable across thousands of requests and reachable by anyone who can hit the public Vercel route.
- **Likelihood / Impact / Risk:** Low / Medium / **Medium**.
- **Effort:** Low. **Cost:** Low. **Scope:** Cross-cutting (5 routes — extract a shared helper).
- **Recommended fix:** Replace with `crypto.timingSafeEqual(Buffer.from(headerSecret), Buffer.from(process.env.CRON_SECRET!))`, after length-checking both buffers. Encapsulate the check in a single `requireCronAuth(req)` helper.

---

### F-07 — Weak password floor (Medium)
- **Affected area:** `app/api/users/route.ts` (`createUserSchema.password.min(6)`), `app/api/users/[userId]/password/route.ts` (`newPassword.length >= 6`), `app/auth/set-new-password/page.tsx` (`if (password.length < 6)`).
- **Description:** A 6-character minimum is well below current NIST 800-63B guidance (8+ chars, screened against breach corpora). Combined with the dev quick-login default `password123`, the floor is too low for an internal sales/finance system.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**.
- **Effort:** Low. **Cost:** Low. **Scope:** Localised (3 files).
- **Recommended fix:** Raise to ≥ 12 characters, reject the top-10k breached passwords (e.g. via a small HIBP k-anonymity lookup or a bundled denylist), and ensure Supabase Auth project setting (`auth.password_min_length`) matches.

---

### F-08 — Open-redirect surface in `/auth/callback?next=…` (Low–Medium)
- **Affected area:** `app/auth/callback/route.ts:4-7` (`getSafeNextPath`).
- **Description:** Only `startsWith("/")` is checked. The redirect is then built as `${origin}${next}`. Inputs such as `//evil.com/x` survive the check; same-origin concatenation defangs them today, but browsers and reverse-proxies have historically normalised double-slashes inconsistently. It is also brittle against future refactors that drop the origin prefix.
- **Likelihood / Impact / Risk:** Low / Medium / **Low–Medium**.
- **Effort:** Low. **Cost:** Low. **Scope:** Localised.
- **Recommended fix:** Reject any `next` that does not match `^/[^/\\]`, or parse with `new URL(next, origin)` and assert `parsed.origin === origin` before redirecting.

---

### F-09 — `grant all … to anon` on new voucher tables (Medium)
- **Affected area:** `supabase/migrations/20260518120000_vouchers_and_service_blocks.sql:74,130,187`.
- **Description:** `booking_package_selections`, `vouchers`, and `voucher_service_blocks` are granted `ALL` privileges to `anon`. RLS is enabled with `to authenticated` policies, so rows are not currently exposed — but the grant is a footgun: any future `ALTER TABLE … DISABLE ROW LEVEL SECURITY` (intentional or accidental) immediately opens these tables to the public anon key.
- **Likelihood / Impact / Risk:** Low / High / **Medium**.
- **Effort:** Low. **Cost:** Low. **Scope:** Localised (new migration).
- **Recommended fix:** Add a follow-up migration that runs `revoke all on table public.<table> from anon;` for those three tables, mirroring the rest of the schema.

---

### F-10 — Missing HTTP security headers (Medium)
- **Affected area:** `next.config.mjs` (no `headers()` defined), `proxy.ts` (no header injection).
- **Description:** Responses ship without `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, `Permissions-Policy`, or `X-Content-Type-Options`. This removes a defense-in-depth layer against the XSS path in F-04, clickjacking on admin pages, and protocol-downgrade attacks.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**.
- **Effort:** Low. **Cost:** Low. **Scope:** Cross-cutting (single config change).
- **Recommended fix:** Add a `headers()` function to `next.config.mjs` returning the standard hardened set (CSP with nonce, `frame-ancestors 'none'`, HSTS with `preload`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), geolocation=()`, `X-Content-Type-Options: nosniff`). Start CSP in report-only mode in dev.

---

### F-11 — Dev quick-login defaults leak staff emails in the client bundle (Low)
- **Affected area:** `app/login/page.tsx:15-23` — `defaultDevQuickLoginEmails` and `defaultDevQuickLoginPasswords = ["password123"]`.
- **Description:** Five real-looking staff emails and the default password `password123` are baked into the client component. They are only rendered when `NODE_ENV === "development"`, but the constants are present in the source / build chain and risk being shipped if `NODE_ENV` is ever misconfigured (or if a dev build is served as a preview). Real user emails also leak through `git grep` and any public mirror of the repository.
- **Likelihood / Impact / Risk:** Low / Low / **Low**.
- **Effort:** Low. **Cost:** Low. **Scope:** Localised.
- **Recommended fix:** Remove the hard-coded staff emails — read them only from `NEXT_PUBLIC_DEV_QUICK_LOGIN_EMAIL` or `localStorage`; collapse the dev-only block behind a single import that is tree-shaken out unless `process.env.NODE_ENV === "development"`. Stop defaulting to `password123`.

---

### F-12 — Document signed URLs (Low–Medium)
- **Affected area:** `app/api/documents/upload/route.ts:14` — `SIGNED_URL_EXPIRY_SECONDS = 3600`.
- **Description:** Uploaded documents (invoices, vouchers, proofs of payment) are returned via 1-hour signed URLs. Anyone who copies the URL out of network logs, browser history, or a forwarded email can re-download the file for an hour. The route also does not re-check booking ownership when generating the signed URL.
- **Likelihood / Impact / Risk:** Low / Medium / **Low–Medium**.
- **Effort:** Low. **Cost:** Low. **Scope:** Localised.
- **Recommended fix:** Shorten the expiry to ~5 minutes for the immediate post-upload redirect, regenerate on demand for subsequent downloads, and add `eq("booking_id", bookingId)` + role checks to any later download endpoint.

---

### F-13 — `images.unoptimized: true` in `next.config.mjs` (Low)
- **Affected area:** `next.config.mjs`.
- **Description:** Disabling Next’s image optimisation skips its remote-URL allowlist and SVG sanitisation safeguards. Combined with `dangerouslySetInnerHTML` in the template preview, an SVG with embedded scripts loaded through `<img>` could become a vector. Not an active vulnerability today but a hardening opportunity.
- **Likelihood / Impact / Risk:** Low / Low / **Low**.
- **Effort:** Low. **Cost:** Low. **Scope:** Localised.
- **Recommended fix:** Remove the `unoptimized: true` flag (or scope it to specific routes), and configure `images.remotePatterns` to restrict where remote images can be loaded from.

---

## 4. Priority Actions

Top issues to address first, ranked by highest risk per unit of effort:

1. **F-01 (Critical)** — Lock down `POST /api/enquiries`: add Zod, drop the `linkedCustomerId` write path, stop overwriting existing customers from the public route, add rate limiting + CAPTCHA. *Highest-impact, single-file fix.*
2. **F-03 (High)** — Either delete or role-gate `POST /api/audit` and constrain `action` to an allowlist.
3. **F-02 (High)** — Sanitise / replace the `.or()` filter interpolation in `app/api/customers/route.ts` and `lib/audit.ts`.
4. **F-06 (Medium)** — Replace cron-secret `!==` with `crypto.timingSafeEqual` in one shared helper (touches 5 routes, < 30 lines).
5. **F-05 (Medium)** — Make `/api/data` return 401 when `user` is null; do not rely solely on RLS.
6. **F-09 (Medium)** — Add a migration that revokes `anon` privileges on the three voucher tables.
7. **F-10 (Medium)** — Add a security-headers block to `next.config.mjs`.
8. **F-04 (Medium)** — Sanitise template preview HTML (or render inside a sandboxed iframe).
9. **F-07 (Medium)** — Raise password minimum to 12 and block breached/common passwords.
10. **F-08, F-11, F-12, F-13 (Low / Low–Medium)** — Tighten the `next` redirect validation, strip hard-coded dev creds, shorten document signed-URL expiry, and remove `images.unoptimized`.

---

*No third-party CVEs were directly identified in this scan; dependency versions in `package.json` (Next 16.1.6, React 19.2.4, Supabase JS 2.98+, Zod 3.24+, Resend 6.9.3) are current at the time of review. Re-run dependency scanning (e.g. `pnpm audit --prod`, GitHub Dependabot) as part of CI to catch newly disclosed CVEs.*
