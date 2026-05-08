# Security Review — Luxus Sales System

| Field | Value |
| --- | --- |
| **Repository** | `hawkcoding/v0-luxu-sales-system` |
| **Branch reviewed** | `claude/friendly-curie-JhQrF` |
| **Run date** | 2026-05-08 |
| **App version** | `2.31` (`lib/version.ts`) |
| **Total findings** | 20 |
| **Highest-risk issue** | Public `/api/enquiries` uses the Supabase **service-role** client with **no Zod validation and no rate limiting** |
| **Lowest-risk issue** | Stale generated types file `linked-remote-types.tmp.ts` committed to repo |
| **Overall security posture** | **Moderate** — auth/RLS architecture is sound and secrets are handled correctly, but multiple high-impact gaps exist around input validation on a public endpoint, missing security headers, weak permission gating on a few mutating routes, and a weak password policy. |

---

## 1. Summary

- **Total vulnerabilities / weaknesses:** 20
- **Critical / High:** 5
- **Medium:** 7
- **Low:** 7
- **Informational:** 1
- **Highest-risk issue:** **F-01 — Public `/api/enquiries` POST runs under the Supabase service-role key with no Zod validation, no rate limiting, and trusts arbitrary client input.** A single un-authenticated attacker can mass-insert customers and bookings, poison free-text fields (`raw_text`, `extracted_json`) that are later rendered/processed server-side, and exhaust quota.
- **Lowest-risk issue:** **F-20 — `linked-remote-types.tmp.ts` (86 KB) is committed.** It is a generated artifact that should live in `tmp/` or be `.gitignore`d. No secrets are leaked; only repo hygiene impact.
- **Overall posture:** **Moderate.** Foundational controls (RLS, session/service split, env hygiene, CI lockfile) are correct, but several mutating routes skip Zod or skip role checks and would currently be defended only by Supabase RLS — a single misconfigured policy turns those into critical issues. No security headers / CSP are configured, which compounds the existing `dangerouslySetInnerHTML` and SVG-upload paths.

---

## 2. Risk Matrix

| ID | Issue | Likelihood | Impact | Risk |
| --- | --- | --- | --- | --- |
| F-01 | Public `/api/enquiries` uses service-role client without Zod or rate limiting | High | High | **Critical** |
| F-02 | `/api/templates` PATCH has no auth check, no role check, no Zod validation | High | High | **High** |
| F-03 | `/api/payments/[id]` PATCH has no role check and no Zod validation | High | High | **High** |
| F-04 | No HTTP security headers (CSP, X-Frame-Options, HSTS, nosniff, Referrer-Policy) | High | Medium | **High** |
| F-05 | `dangerouslySetInnerHTML` renders unsanitised template HTML | Medium | High | **High** |
| F-06 | Voucher upload allows SVG into a **public** storage bucket | Medium | High | **Medium** |
| F-07 | Weak password policy — `min 6` characters, no complexity, no breach-list check | High | Medium | **Medium** |
| F-08 | Wide `GRANT ALL ... TO anon` on many tables (sole defence is RLS) | Medium | High | **Medium** |
| F-09 | No rate limiting / abuse controls on public endpoints (`/api/enquiries`, `/login`, password reset) | High | Medium | **Medium** |
| F-10 | Raw Supabase `error.message` echoed to clients (DB-detail leak) | High | Low | **Medium** |
| F-11 | CSV audit export vulnerable to formula injection | Medium | Medium | **Medium** |
| F-12 | No CSRF tokens; relies solely on browser SameSite default | Low | Medium | **Medium** |
| F-13 | `select('*')` used widely in API routes (over-exposure) | Medium | Low | **Low** |
| F-14 | No `pnpm audit` / SCA / Dependabot step in CI | Medium | Low | **Low** |
| F-15 | Customer-import route returns rich error diagnostics in non-production | Low | Medium | **Low** |
| F-16 | Dev quick-login email & passwords stored in `localStorage` | Low | Medium | **Low** |
| F-17 | Public bucket `voucher-assets` readable by anyone | Low | Medium | **Low** |
| F-18 | Hardcoded `actor: "admin"` in `/api/templates` audit insert (audit-trail integrity) | Medium | Low | **Low** |
| F-19 | Orphaned auth user on rollback failure in `/api/users` POST | Low | Low | **Low** |
| F-20 | Generated `linked-remote-types.tmp.ts` (86 KB) committed to repo | Low | Low | **Informational** |

---

## 3. Detailed Findings

### F-01 — Public `/api/enquiries` uses service-role client without Zod or rate limiting (Critical)
- **Description:** `app/api/enquiries/route.ts:88` is an unauthenticated POST endpoint (web form + paste import) that immediately calls `createServiceClient()` (line 93) — a key that **bypasses RLS**. The body is read with `await req.json()` and consumed directly: `body.email`, `body.name`, `body.travellers[]`, `body.transportRequests[]`, `body.extractedJson`, `body.rawText`, etc. There is no Zod schema, no length cap, no enum validation, no rate limiting, and no CAPTCHA / honeypot. Any internet user can:
  - Mass-insert customers / bookings (`upsert` on email, `INSERT` into `bookings`, `booking_suites`, `travellers`, `booking_transport_requests`, `audit_logs`).
  - Set `terms_accepted` to arbitrary values (line 203).
  - Inject arbitrary blobs into `extracted_json` (line 202) and `raw_text` (line 201) that later get rendered in admin UI / email templates / PDF voucher pipeline.
  - Force `body.extendStay`, `body.additionalServices`, `body.promotionCode` and arbitrary `body.purpose`, exhausting Supabase quota.
- **Affected area:** `app/api/enquiries/route.ts`
- **Likelihood / Impact / Risk:** High / High / **Critical**
- **Effort:** Medium
- **Cost:** Medium
- **Scope:** Localised (one route), but pulls in shared validation patterns
- **Recommended fix:**
  - Add a Zod schema covering every field, with strict caps (`max(120)` for names/emails, `max(20_000)` for `rawText`, `max(50)` for arrays).
  - Validate `purpose`, `direction`, `extendStay`, `suiteTypes` against enums.
  - Replace permissive `any[]` traveller arrays with typed schemas.
  - Add rate limiting (Upstash, Vercel Edge Config, or a custom Postgres bucket keyed by IP) — e.g. 5 req / IP / minute.
  - Add a hidden honeypot field and Turnstile/hCaptcha for the public form path.
  - Move quota-sensitive inserts behind a queue or a "draft enquiry" workflow that consultants promote, instead of writing straight to production tables.

### F-02 — `/api/templates` PATCH has no auth, no role check, no Zod validation (High)
- **Description:** `app/api/templates/route.ts:24-67` reads `body = await req.json()` and updates the `templates` row whose `id = body.id`. There is no `supabase.auth.getUser()`, no `clearance_level === 'admin'` check, no Zod schema. The audit insert at line 51 hardcodes `actor: "admin"`, so the audit trail is also wrong. Defence reduces to whatever RLS happens to allow on `templates`. `body.bodyHtml` is later embedded via `dangerouslySetInnerHTML` (see F-05), so a write here is also a stored-XSS vector against the next admin who previews the template.
- **Affected area:** `app/api/templates/route.ts`
- **Likelihood / Impact / Risk:** High / High / **High**
- **Effort:** Low
- **Cost:** Low
- **Scope:** Localised
- **Recommended fix:**
  - Mirror the `requireAdmin()` pattern from `app/api/users/route.ts` and reject non-admins with 401/403.
  - Add a Zod schema (`{ id: uuid, subject?: string.max(300), bodyHtml?: string.max(50_000), active?: boolean }`).
  - Set `actor` and `actor_user_id` from the authenticated profile (as `app/api/audit/route.ts` already does).
  - Sanitise `bodyHtml` server-side (e.g. `sanitize-html` allow-list) before writing.

### F-03 — `/api/payments/[id]` PATCH has no role check, no Zod validation (High)
- **Description:** `app/api/payments/[id]/route.ts:4-40` validates only `user != null`. Any authenticated user (including `readonly` clearance) can call it; a typed object is constructed manually from `body.bookingId / jobId / amount / method / reference / notes` with **no type or range checks** — `amount` could be a string, a negative number, a DoS-sized JSON object, etc. There is no ownership check that the payment belongs to a job the user can access — RLS is the sole defence.
- **Affected area:** `app/api/payments/[id]/route.ts`
- **Likelihood / Impact / Risk:** High / High / **High**
- **Effort:** Low
- **Cost:** Low
- **Scope:** Localised
- **Recommended fix:** Gate behind a `clearance_level in ('admin','manager','consultant')` check, add a Zod schema with `amount: z.number().nonnegative().max(1_000_000_000)`, `method: z.enum(...)`, etc., and verify the payment row exists for the caller before updating.

### F-04 — No HTTP security headers (High)
- **Description:** `next.config.mjs` ships only `images.unoptimized = true` and exposes no `headers()` hook. There is no `middleware.ts` that injects headers; `vercel.json` declares no `headers` block. As a result the app sends none of: `Content-Security-Policy`, `X-Frame-Options` / `frame-ancestors`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`. Combined with F-05 (`dangerouslySetInnerHTML`) and F-06 (SVG upload), the absence of CSP turns minor template-injection bugs into full XSS.
- **Affected area:** `next.config.mjs`, `proxy.ts` (or new `middleware.ts`), `vercel.json`
- **Likelihood / Impact / Risk:** High / Medium / **High**
- **Effort:** Low
- **Cost:** Low
- **Scope:** Cross-cutting (whole site)
- **Recommended fix:** Add a `headers()` block in `next.config.mjs` (or `middleware.ts`) that sets a strict CSP (`default-src 'self'; img-src 'self' https://*.supabase.co data:; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'`), HSTS (`max-age=63072000; includeSubDomains; preload`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`. Tighten `script-src` once any inline scripts are removed.

### F-05 — `dangerouslySetInnerHTML` renders unsanitised template HTML (High)
- **Description:** `app/app/templates/page.tsx:185` renders `preview?.bodyHtml` straight into the DOM:
  ```tsx
  <div className="text-sm" dangerouslySetInnerHTML={{ __html: preview?.bodyHtml || "" }} />
  ```
  The body is loaded from the `templates` table, which is editable through `/api/templates` (see F-02). With no auth on that PATCH route, an attacker that gets any session can plant `<script>` payloads that execute in any admin's browser the next time they preview the template — including session token theft via Supabase cookies (HttpOnly mitigates, but local-storage tokens, app data, and CSRF actions remain reachable). `components/ui/chart.tsx:83` uses `dangerouslySetInnerHTML` for static theme CSS only — informational.
- **Affected area:** `app/app/templates/page.tsx`, supporting routes `app/api/templates/route.ts`
- **Likelihood / Impact / Risk:** Medium / High / **High**
- **Effort:** Low
- **Cost:** Low
- **Scope:** Localised
- **Recommended fix:** Sanitise with `sanitize-html` (allow-list of safe tags / attributes) at the time of save **and** at render. Or render with a safe MJML / handlebars renderer that escapes by default. Even with sanitisation, also fix F-02 and F-04 (CSP) for defence in depth.

### F-06 — Voucher upload allows SVG into a public bucket (Medium)
- **Description:** `app/api/voucher-template/upload/route.ts:24-27` accepts `image/svg+xml` for either `logo` or `banner` based on the *client-supplied* `file.type`. The destination bucket `voucher-assets` is created `public = true` in `supabase/migrations/20260506130000_voucher_assets_bucket.sql`. SVGs can carry `<script>` and event handlers that execute when the file is opened directly in a browser via the public Supabase URL or rendered inline in voucher HTML. The MIME check is not validated against magic bytes, so any file with a spoofed `type` is accepted. Upload is admin-only, but a compromised or malicious admin (or stolen session) can drop an XSS-armed SVG that is then served from the public CDN with the app's domain context if proxied, or used as a phishing pivot via the Supabase URL.
- **Affected area:** `app/api/voucher-template/upload/route.ts`, `supabase/migrations/20260506130000_voucher_assets_bucket.sql`, `lib/upload-limits.ts`
- **Likelihood / Impact / Risk:** Medium / High / **Medium**
- **Effort:** Medium
- **Cost:** Low
- **Scope:** Localised
- **Recommended fix:**
  - Either drop SVG entirely (rasterise on upload), or run server-side SVG sanitisation (e.g. DOMPurify in JSDOM, removing `<script>`, `on*` attrs, external `xlink:href`).
  - Validate magic bytes (`file-type` package) instead of trusting `file.type`.
  - Force a `Content-Disposition: attachment` and/or `Content-Security-Policy: sandbox` header when serving via Supabase storage transformations.
  - Consider making the bucket private and serving via signed URLs.

### F-07 — Weak password policy (Medium)
- **Description:** `app/api/users/route.ts:20` enforces only `password.min(6)`. `app/api/users/[userId]/password/route.ts:58` does the same. There is no complexity, no length cap, no Have-I-Been-Pwned breach check, no rejection of common passwords. The default dev password example is `password123`.
- **Affected area:** `app/api/users/route.ts`, `app/api/users/[userId]/password/route.ts`
- **Likelihood / Impact / Risk:** High / Medium / **Medium**
- **Effort:** Low
- **Cost:** Low
- **Scope:** Cross-cutting (auth)
- **Recommended fix:** Enforce ≥12 chars, mix of classes or zxcvbn ≥ 3, max 128 chars, and check against the HIBP `range` API. Also enforce in the Supabase Auth project settings so it applies to user-self-resets too.

### F-08 — `GRANT ALL ... TO anon` on public schema tables (Medium)
- **Description:** Multiple migrations grant `ALL` privileges on tables to the `anon` role: `supplier_emails`, `countries`, `country_aliases`, `supplier_pricing_options`, `supplier_seasonal_periods`, `supplier_seasonal_prices`, `booking_transport_requests`, `supplier_email_labels`, `customer_linked_accounts`, etc. This is the Supabase-default boilerplate from `supabase db pull`, but it means **the only barrier** between an unauthenticated visitor with the anon key and full read/write on those tables is the per-table RLS policy. A developer who later adds a table without `ENABLE ROW LEVEL SECURITY` (or with an over-broad policy) immediately gives the public access. Several of these tables (e.g. `customer_linked_accounts`, `booking_transport_requests`) hold customer PII.
- **Affected area:** `supabase/migrations/*.sql`
- **Likelihood / Impact / Risk:** Medium / High / **Medium**
- **Effort:** Medium
- **Cost:** Low
- **Scope:** Cross-cutting
- **Recommended fix:** Replace blanket `GRANT ALL ... TO anon` with the minimum needed (`SELECT` only on truly public reference tables like `countries`). For everything else, `REVOKE ALL ... FROM anon` and grant explicitly to `authenticated`. Add a CI check (`pgTAP` or a Supabase advisor query) that fails the build if any table without RLS is reachable by `anon`.

### F-09 — No rate limiting / abuse controls (Medium)
- **Description:** No middleware, no Vercel WAF rule, no `upstash/ratelimit` usage anywhere. `proxy.ts` only handles auth refresh. Brute-force on `/login`, password-reset enumeration, mass enquiry creation (F-01), and abusive `/api/voucher-template/upload` attempts are all unconstrained.
- **Affected area:** `proxy.ts`, `app/login/page.tsx`, `app/api/enquiries/route.ts`, all `/api/**`
- **Likelihood / Impact / Risk:** High / Medium / **Medium**
- **Effort:** Medium
- **Cost:** Low
- **Scope:** Cross-cutting
- **Recommended fix:** Add IP-keyed rate limits (e.g. Upstash Redis or `@vercel/edge-config`) inside `proxy.ts` with stricter buckets for `/login`, `/api/enquiries`, password reset, and uploads. Lock accounts after N failed logins.

### F-10 — Raw Supabase `error.message` echoed to clients (Medium)
- **Description:** Many routes return `error.message` verbatim, which can include constraint names, column names, RLS hint text, and policy errors (`permission denied for table xyz`):
  - `app/api/cron/email-sync/route.ts:16`
  - `app/api/cron/pipeline-auto-close/route.ts:58, 73, 110, 122, 152, 164`
  - `app/api/payments/[id]/route.ts:30`
  - `app/api/templates/route.ts:49`
  - `app/api/voucher-template/upload/route.ts:81, 107`
  - `app/api/users/[userId]/route.ts:101, 122, 220` (and many more sampled)
- **Affected area:** Almost every route in `app/api/`
- **Likelihood / Impact / Risk:** High / Low / **Medium**
- **Effort:** Medium
- **Cost:** Low
- **Scope:** Cross-cutting
- **Recommended fix:** Introduce a small `respondWithError(error, fallback)` helper that logs the raw error server-side and returns a generic message to the client. Reserve detailed messages for `process.env.NODE_ENV === 'development'`.

### F-11 — CSV formula injection in audit export (Medium)
- **Description:** `lib/export-audit.ts:85-122` (`exportAuditToCsv`) only quote-escapes `"` characters. Cell values that begin with `=`, `+`, `-`, `@`, or tab/CR are rendered as formulas in Excel / Google Sheets, allowing data exfiltration via `=HYPERLINK(...)` or, on legacy Excel with DDE enabled, command execution. The `actor`, `action`, and JSON payload columns can all be attacker-influenced (e.g. via the public `/api/enquiries` route — F-01).
- **Affected area:** `lib/export-audit.ts`, `app/api/audit/export/route.ts`
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**
- **Effort:** Low
- **Cost:** Low
- **Scope:** Localised
- **Recommended fix:** In `csvCell`, prefix any value that starts with `=`, `+`, `-`, `@`, `\t`, or `\r` with a leading single quote (`'`) before quoting, per OWASP CSV-injection guidance. Apply the same fix to any other CSV exporters.

### F-12 — No CSRF tokens (Medium)
- **Description:** Mutating routes (`POST/PATCH/DELETE`) accept JSON without an additional CSRF token; protection relies on Supabase auth cookies being `SameSite=Lax`. Most modern browsers respect that, but custom subdomain layouts, browser bugs, or Vercel preview deploys with auth cookies can weaken the guarantee. Critical multi-tenant actions (`/api/users/[id]` DELETE, `/api/users/[id]/password`) deserve explicit double-submit token or origin checks.
- **Affected area:** `proxy.ts`, all mutating `app/api/**` routes
- **Likelihood / Impact / Risk:** Low / Medium / **Medium**
- **Effort:** Medium
- **Cost:** Low
- **Scope:** Cross-cutting
- **Recommended fix:** Either add `origin === host` checks in the proxy for all mutating methods, or implement a double-submit cookie token. At minimum, set `SameSite=Strict` on the Supabase auth cookie for the production domain.

### F-13 — Wide `select('*')` usage (Low)
- **Description:** Per the project rule in `CLAUDE.md` (line 87) production code should avoid `select('*')`. Routes that still do: `app/api/jobs/[id]/route.ts`, `app/api/jobs/[id]/transport-requests/route.ts`, `app/api/packages/route.ts`, `app/api/packages/[slug]/helpers.ts`, `app/api/locations/route.ts`, `app/api/customers/[id]/route.ts`, `app/api/templates/route.ts`, `app/api/data/route.ts`, `app/api/suppliers/route.ts`, `app/api/suppliers/helpers.ts`, `app/api/settings/inbound-email/accounts/[id]/sync/route.ts`, `app/api/settings/inbound-email/accounts/[id]/test/route.ts`. Adding a column with sensitive data later silently exposes it.
- **Affected area:** API routes listed above.
- **Likelihood / Impact / Risk:** Medium / Low / **Low**
- **Effort:** Low
- **Cost:** Low
- **Scope:** Cross-cutting
- **Recommended fix:** Replace each with explicit column lists; add an ESLint rule (or grep CI step) that blocks new `select('*')` introductions.

### F-14 — No SCA / dependency audit in CI (Low)
- **Description:** `.github/workflows/ci.yml` runs lint, typecheck, test, build only. There is no `pnpm audit`, no Dependabot config in `.github/`, and no advisory alert step. Dependencies otherwise look current (Next 16.1.6, React 19.2.4, Supabase JS 2.98.0, Zod 3.24.1, Resend 6.9.3) and no known-vulnerable ranges were spotted by inspection.
- **Affected area:** `.github/workflows/ci.yml`, `.github/dependabot.yml` (missing)
- **Likelihood / Impact / Risk:** Medium / Low / **Low**
- **Effort:** Low
- **Cost:** Low
- **Scope:** Localised
- **Recommended fix:** Add a `pnpm audit --prod --audit-level=high` step (failing the build), and a `.github/dependabot.yml` for weekly upgrades.

### F-15 — Customer-import route returns rich diagnostics in non-production (Low)
- **Description:** `app/api/customers/import/route.ts` (referenced in agent audit, lines ~65-76) returns `{ error, phase, traceId, details }` whenever `NODE_ENV !== 'production'`. Vercel preview deployments run with `NODE_ENV=production`, so this is mostly safe — but a misconfigured environment or self-hosted deployment will leak internal phase/trace info to end users.
- **Affected area:** `app/api/customers/import/route.ts`
- **Likelihood / Impact / Risk:** Low / Medium / **Low**
- **Effort:** Low
- **Cost:** Low
- **Scope:** Localised
- **Recommended fix:** Check a stricter signal (`process.env.LUXUS_DEBUG === '1'`) or limit verbose responses to admins only. Always log full details server-side.

### F-16 — Dev quick-login email & passwords stored in `localStorage` (Low)
- **Description:** `app/login/page.tsx:55-87` reads `devQuickLoginEmail` / `devQuickLoginPasswords` from `localStorage` (gated by `NODE_ENV === 'development'`). Anyone with XSS access in dev can read and replay credentials. The defaults (`carmen@luxustravel.co.za`, `password123`) being committed to `.env.local.example` increase the chance those values end up reused in real environments.
- **Affected area:** `app/login/page.tsx`, `.env.local.example`
- **Likelihood / Impact / Risk:** Low / Medium / **Low**
- **Effort:** Low
- **Cost:** Low
- **Scope:** Localised
- **Recommended fix:** Replace the localStorage flow with a one-shot dev login button that fetches from a `dev-only` server route, or use Supabase's magic-link locally. Remove the example credentials.

### F-17 — Public bucket `voucher-assets` (Low)
- **Description:** `supabase/migrations/20260506130000_voucher_assets_bucket.sql` creates the bucket with `public = true`. Anyone who guesses the path (`logo.png`, `banner.webp`, `logo.svg`) can fetch it. That's by design for embedding in voucher HTML, but it removes any "internal use only" assumption — do not store anything sensitive there.
- **Affected area:** `supabase/migrations/20260506130000_voucher_assets_bucket.sql`
- **Likelihood / Impact / Risk:** Low / Medium / **Low**
- **Effort:** Medium
- **Cost:** Low
- **Scope:** Localised
- **Recommended fix:** Switch to a private bucket and serve via short-lived signed URLs. Or keep public but add a `Cache-Control: no-store` header and treat the bucket as truly public.

### F-18 — Hardcoded `actor: "admin"` in `/api/templates` audit insert (Low)
- **Description:** `app/api/templates/route.ts:52` writes `actor: "admin"` (string literal) to `audit_logs`. The audit trail therefore credits the wrong user, undermining accountability when investigating template tampering (which is an XSS vector via F-05).
- **Affected area:** `app/api/templates/route.ts`
- **Likelihood / Impact / Risk:** Medium / Low / **Low**
- **Effort:** Low
- **Cost:** Low
- **Scope:** Localised
- **Recommended fix:** Replace with the authenticated user's display name and `actor_user_id` (mirror the pattern in `app/api/audit/route.ts:73-89`). Closes naturally when F-02 is fixed.

### F-19 — Orphaned auth user when rollback fails (Low)
- **Description:** `app/api/users/route.ts:163-177` attempts `service.auth.admin.deleteUser(createdUserId)` when profile insert fails. If both the profile insert and the rollback delete fail, an `auth.users` row exists with no profile — that user can sign in but the app does not list them in `/api/users`, and they may not be subject to the same RLS-by-clearance checks. Logged but not acted on.
- **Affected area:** `app/api/users/route.ts`
- **Likelihood / Impact / Risk:** Low / Low / **Low**
- **Effort:** Low
- **Cost:** Low
- **Scope:** Localised
- **Recommended fix:** Wrap user-creation in a single Supabase RPC that creates auth and profile atomically, or queue a cleanup job that reconciles `auth.users` against `profiles` periodically.

### F-20 — Generated `linked-remote-types.tmp.ts` committed (Informational)
- **Description:** `linked-remote-types.tmp.ts` (86 KB) is a `.tmp.ts` build artefact committed to the repo. It contains schema typings, not secrets, but adds noise to diffs and review.
- **Affected area:** `linked-remote-types.tmp.ts`, `.gitignore`
- **Likelihood / Impact / Risk:** Low / Low / **Informational**
- **Effort:** Low
- **Cost:** Low
- **Scope:** Localised
- **Recommended fix:** Move to `tmp/` and add `*.tmp.ts` (or just the file) to `.gitignore`.

---

## 4. Priority Actions

Best risk-reduction per unit of effort, in order:

1. **F-02 — Add `requireAdmin()` + Zod to `/api/templates` PATCH.** ~30 min of work eliminates a high-impact stored-XSS vector and an audit-trail integrity bug.
2. **F-03 — Add Zod + role check to `/api/payments/[id]` PATCH.** Equally cheap, protects financial data.
3. **F-04 — Add a `headers()` block in `next.config.mjs`.** Single file change, blunts the impact of any future XSS or clickjacking issue across the whole app.
4. **F-01 — Lock down `/api/enquiries`** with Zod, IP rate limiting, CAPTCHA / honeypot, and field-level caps. Highest blast radius if exploited; medium effort.
5. **F-05 — Sanitise `bodyHtml`** with `sanitize-html` before storing **and** rendering in `app/app/templates/page.tsx:185`.
6. **F-07 — Strengthen the password policy** in both creation and reset routes, and in the Supabase Auth dashboard.
7. **F-11 — Patch `csvCell()`** with the leading-`'` neutralisation so CSV exports stop being a formula-injection sink.
8. **F-10 — Introduce `respondWithError()` helper** to stop leaking raw Supabase messages.
9. **F-08 — Audit `GRANT ... TO anon`** and replace with least-privilege grants to `authenticated`.
10. **F-09 — Add IP-keyed rate limiting** at the proxy layer for `/login`, `/api/enquiries`, password reset, and uploads.

Lower-priority cleanup (F-13 through F-20) can be batched into a single hardening PR.

---

*Report generated by the security-review agent. No application code was modified by this run.*
