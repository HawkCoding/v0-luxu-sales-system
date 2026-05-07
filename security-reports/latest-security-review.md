# Security Review — Luxus Sales System

| Field | Value |
|---|---|
| Repository | `hawkcoding/v0-luxu-sales-system` |
| Run date | 2026-05-07 |
| Branch reviewed | `claude/friendly-curie-QqBWP` |
| Total findings | 18 |
| Overall security posture | **Poor** |
| Highest-risk issue | **F1 — Public unauthenticated `/api/enquiries` route uses the service-role key with no input validation, enabling customer-record tampering** |
| Lowest-risk issue | **F18 — `patchJobSchema.passthrough()` accepts unused extra fields** |

---

## 1. Summary

- **18 findings** across application logic, dependencies, configuration, AuthN/AuthZ, and data handling.
- **3 High-risk**: a public service-role intake endpoint (F1), multiple critical/high CVEs in the pinned `next@16.1.6` (F2), and a stored-XSS chain via templates (F4 + F5).
- **Several API routes ship without authentication**, relying solely on Supabase RLS — defence-in-depth is missing in places where it should not be.
- One route (`POST /api/correspondence`, F7) contains residual prototype code (`Math.random() > 0.1`) that randomly fakes "send" failures and would behave non-deterministically in production.
- The encryption used for IMAP passwords (F10) is AES-256-GCM but the key is derived from a raw env var via plain SHA-256 — acceptable only when the env var is a 32-byte random secret, which is not enforced.
- Posture is rated **Poor** on the strength of F1 (data tampering anyone on the internet can do) plus the unpatched runtime CVEs in `next`.

## 2. Risk Matrix

| # | Issue | Likelihood | Impact | Risk |
|---|---|---|---|---|
| F1 | Public `/api/enquiries` uses service role + no Zod, no rate limit | High | High | **High** |
| F2 | `next@16.1.6` ships with multiple unpatched CVEs (incl. RSC DoS 7.5, request smuggling, CSRF bypass) | High | High | **High** |
| F4 | Stored-XSS sink: `dangerouslySetInnerHTML` on `templates.body_html` in admin preview | Medium | High | **High** |
| F5 | `PATCH /api/templates` has no auth check + no Zod + hardcoded audit actor | Medium | High | **High** |
| F6 | `lodash@4.17.23` (transitive via `recharts`) — code injection (CVE-2026-4800, 8.1) + prototype pollution | Low | High | **Medium** |
| F7 | `POST /api/correspondence` has no auth, mock `Math.random()` success, user-controlled audit actor, stores raw HTML | Medium | Medium | **Medium** |
| F8 | `POST /api/payments` has no auth check + user-controlled `actor` for audit log | Medium | Medium | **Medium** |
| F9 | PostgREST `.or()` filter built from user input with incomplete escaping | Medium | Medium | **Medium** |
| F10 | `EMAIL_CREDENTIAL_ENCRYPTION_KEY` derived via plain SHA-256, no KDF | Low | High | **Medium** |
| F11 | Password policy minimum is 6 chars, no complexity requirement | Medium | Medium | **Medium** |
| F12 | `next` cron endpoints accept `Authorization: Bearer …` over plain HTTP if not behind TLS — depends on deployment | Low | Medium | **Medium** |
| F13 | `postcss<8.5.10` XSS via unescaped `</style>` (CVE-2026-41305) | Low | Medium | **Medium** |
| F3 | `POST /api/quotes` lacks Zod schema and uses `any[]` for line items | Medium | Low | **Low–Med** |
| F14 | Several read endpoints (`GET /api/data`, `GET /api/jobs/[id]`, `GET /api/templates`) skip the explicit `auth.getUser()` 401 gate | Medium | Medium | **Medium** |
| F15 | Supabase / PostgREST error messages echoed straight to client (`error.message`) | High | Low | **Low–Med** |
| F16 | Hardcoded dev-quick-login emails + password `password123` in `app/login/page.tsx` (gated by `NODE_ENV==='development'`) | Low | Medium | **Low–Med** |
| F17 | Admin-only password reset (`POST /api/users/[id]/password`) does not require fresh re-auth or MFA | Low | Medium | **Low** |
| F18 | `patchJobSchema.passthrough()` accepts arbitrary extra fields | Low | Low | **Low** |

## 3. Detailed Findings

### F1 — Public `/api/enquiries` writes via service role with no schema validation

- **Description**: `app/api/enquiries/route.ts` exposes a public `POST` (consumed by the website enquiry form / paste-import). It instantiates `createServiceClient()`, then takes the raw JSON body and (a) **looks up an existing customer by email and overwrites their `first_name`, `last_name`, `phone`, `country`, `title`** (lines 113–135), (b) inserts a new `bookings` row with arbitrary `purpose`, `extracted_json`, `child_ages`, `extra_nights`, etc., (c) inserts arbitrary rows into `booking_suites`, `travellers`, `booking_transport_requests`, and `audit_logs`. There is **no Zod validation, no captcha, no rate limit, and no provenance check on the email**. `body` is treated as `any`.
- **Affected area**: `app/api/enquiries/route.ts:88-318`
- **Likelihood / Impact / Risk**: High / High / **High**
- **Effort estimate**: Medium — add Zod schema, switch to RLS-aware client + signed intake token, add captcha (Turnstile/hCaptcha), and bound numeric fields.
- **Cost implication**: Medium
- **Scope of fix**: Localised to this route, but with cross-cutting impact on the public form's contract.
- **Recommended fix**:
  1. Add a strict Zod schema for the body; reject unknown fields (no `.passthrough()`).
  2. Stop merging into existing customer rows on email match — instead create a "lead" record and let staff resolve the merge in-app.
  3. Add Turnstile/hCaptcha and a per-IP rate limit (Upstash, Vercel KV, or `@upstash/ratelimit`).
  4. Cap `noOfAdults`, `noOfChildren`, `noOfSuites`, `extraNights` to sane integers (e.g. ≤ 30).
  5. Reject oversized `extractedJson` / `rawText` (e.g. > 32 KB) to prevent storage DoS.
  6. Set `actor` to a constant `"public_intake"` rather than reading anything that resembles user input.

### F2 — `next@16.1.6` is affected by six published advisories

- **Description**: `pnpm audit --prod` reports the following on the pinned `next@16.1.6`:
  - **GHSA-q4gf-8mx6-v5v3 / CVE-2026-23869** — RSC server-function deserialization DoS (CVSS 7.5, **High**).
  - **GHSA-ggv3-7p47-pfv8 / CVE-2026-29057** — HTTP request smuggling in `rewrites`.
  - **GHSA-3x4c-7xq6-9pq8 / CVE-2026-27980** — unbounded `next/image` disk cache → DoS.
  - **GHSA-h27x-g6w4-24gq / CVE-2026-27979** — unbounded PPR resume buffering → DoS.
  - **GHSA-mq59-m269-xvcx / CVE-2026-27978** — `Origin: null` bypasses Server-Action CSRF check.
  - **GHSA-jcc7-9wpm-mj36 / CVE-2026-27977** — dev HMR websocket CSRF (low).
- **Affected area**: `package.json:82` → `"next": "16.1.6"`
- **Likelihood / Impact / Risk**: High / High / **High**
- **Effort estimate**: Low — single dependency bump and a smoke test of App Router routes.
- **Cost implication**: Low
- **Scope of fix**: Localised (lockfile + verify build).
- **Recommended fix**: `pnpm up next@^16.2.3`, regenerate `pnpm-lock.yaml`, run `pnpm test:ci` and `pnpm build`. Confirm Vercel deploys cleanly.

### F3 — `POST /api/quotes` has no Zod validation and uses `any[]`

- **Description**: `app/api/quotes/route.ts` reads `body = await req.json()` then trusts every field, including `body.lineItems: any[]`. Authentication is enforced (line 9), so RLS still applies, but a client can submit unbounded payloads (line-item flooding) and unexpected fields land in the insert.
- **Affected area**: `app/api/quotes/route.ts:5-62`
- **Likelihood / Impact / Risk**: Medium / Low / **Low–Medium**
- **Effort estimate**: Low
- **Cost implication**: Low
- **Scope of fix**: Localised.
- **Recommended fix**: Define a Zod schema covering `bookingId` (UUID), `status` (enum), numeric fields (≥ 0), `lineItems` (array, max length, all string/number/numeric bounds). Strip `body.actor`-style sneak fields with `.strict()`.

### F4 — Stored-XSS sink: `dangerouslySetInnerHTML` on `templates.body_html`

- **Description**: `app/app/templates/page.tsx:232` renders the template preview with `dangerouslySetInnerHTML={{ __html: preview?.bodyHtml || "" }}`. The HTML comes straight from the `templates` table. Any user able to update a template (see F5) can persist `<script>` and execute it in the next admin/manager who opens the preview.
- **Affected area**: `app/app/templates/page.tsx:232`
- **Likelihood / Impact / Risk**: Medium / High / **High**
- **Effort estimate**: Low — sanitise on render.
- **Cost implication**: Low
- **Scope of fix**: Localised (template preview), but should be applied wherever `body_html` is rendered.
- **Recommended fix**: Sanitise with `DOMPurify` (or `isomorphic-dompurify`) before passing to `dangerouslySetInnerHTML`, allowlisting the tags/attributes the templates legitimately need (`<p>`, `<br>`, `<a>`, `<strong>`, `<em>`, `<ul>`, `<li>`, `<img>` with safe `src`). Configure CSP `script-src 'self'` so any future regression is blocked.

### F5 — `PATCH /api/templates` has no authentication, no Zod, hardcoded actor

- **Description**: `app/api/templates/route.ts` (lines 24–67) does not call `supabase.auth.getUser()`. It accepts a body with `id`, `subject`, `bodyHtml`, `active` and updates the row. It then audits with `actor: "admin"` — a literal string, not the real user. The route relies entirely on RLS.
- **Affected area**: `app/api/templates/route.ts:24-67`
- **Likelihood / Impact / Risk**: Medium / High / **High** (chained with F4)
- **Effort estimate**: Low
- **Cost implication**: Low
- **Scope of fix**: Localised.
- **Recommended fix**:
  1. Gate the route with `requireAdminSettingsAccess()` (or a manager equivalent — pattern already exists in `lib/settings-access.ts`).
  2. Validate body with Zod (`id: uuid`, `subject ≤ 200`, `bodyHtml ≤ 32 KB`, `active: boolean`).
  3. Server-side sanitise `bodyHtml` before persisting (DOMPurify or a sanitising-server lib).
  4. Set `actor` from `profiles` (real user), not the string literal `"admin"`.

### F6 — `lodash@4.17.23` (transitive via `recharts`) has code-injection + prototype-pollution CVEs

- **Description**: `pnpm audit` flags `lodash 4.17.23` with **CVE-2026-4800** (`_.template` code injection through `options.imports`, CVSS 8.1) and **CVE-2026-2950** (prototype pollution in `_.unset`/`_.omit`). The path is `recharts > lodash`. The app does not directly call `_.template` with untrusted input, so direct exploitability is bounded — but the prototype-pollution gadget is a generic risk.
- **Affected area**: `pnpm-lock.yaml` → `recharts > lodash@4.17.23`
- **Likelihood / Impact / Risk**: Low / High / **Medium**
- **Effort estimate**: Low–Medium — rely on `recharts` upstream bumping lodash, or `pnpm-overrides` to force `lodash@>=4.18.0` and run the chart suite.
- **Cost implication**: Low
- **Scope of fix**: Localised (lockfile / overrides), but verify `recharts` still works.
- **Recommended fix**: Add a `pnpm.overrides` entry pinning `lodash@^4.18.0`, then `pnpm install` and exercise dashboard charts.

### F7 — `POST /api/correspondence` has no auth, mocks failures, allows unsanitised HTML and forged actor

- **Description**: `app/api/correspondence/route.ts:5-80` (a) does not call `auth.getUser()` (line 5–7), (b) decides `success` via `Math.random() > 0.1` — clearly leftover prototype code that should not run in production, (c) inserts `body.bodyHtml` directly into `correspondences.body_html` without sanitisation, and (d) sets the audit log `actor: body.actor || "consultant"`. Combined: any RLS-permitted user can spoof who sent a message and persist arbitrary HTML.
- **Affected area**: `app/api/correspondence/route.ts:5-80`
- **Likelihood / Impact / Risk**: Medium / Medium / **Medium**
- **Effort estimate**: Medium — replace the mock with the real send pipeline (Resend / IMAP outbox), sanitise HTML, gate with auth + Zod.
- **Cost implication**: Medium
- **Scope of fix**: Localised but couples to the correspondence feature.
- **Recommended fix**:
  1. Add `auth.getUser()` 401 gate; derive `actor` from the authenticated profile.
  2. Replace `Math.random()` simulation with a real send (or move this route under `/api/dev/...` and gate by `NODE_ENV !== "production"`).
  3. Sanitise `bodyHtml` with DOMPurify before insert, or store a structured representation and render via a safe template.
  4. Validate body with Zod.

### F8 — `POST /api/payments` has no auth check and user-controlled audit actor

- **Description**: `app/api/payments/route.ts:5-46` calls `createSessionClient()` but never checks `auth.getUser()`. The audit log uses `body.actor || "consultant"`. RLS will still gate the insert, but defence-in-depth is missing and the audit trail is forgeable.
- **Affected area**: `app/api/payments/route.ts:5-46`
- **Likelihood / Impact / Risk**: Medium / Medium / **Medium**
- **Effort estimate**: Low
- **Cost implication**: Low
- **Scope of fix**: Localised.
- **Recommended fix**: Add the standard `auth.getUser()` 401 gate, validate with Zod (`amount` > 0, `method` enum, lengths bounded), and derive `actor` from the user's profile, never from the body.

### F9 — PostgREST `.or()` filter built from user input has incomplete escaping

- **Description**: Two locations interpolate user-controlled search strings into PostgREST `.or(...)` clauses, escaping only `,`, `%`, and `_`:
  - `app/api/customers/route.ts:24-29`
  - `lib/audit.ts:251-256`

  Parentheses, periods, the `.` separator inside PostgREST filter syntax, and the operator names themselves are not escaped. A search like `a),actor.eq.admin,b.ilike.(` can break out of the `ilike` clause and add new conditions. Combined with RLS this is unlikely to leak rows the user shouldn't see, but it can corrupt result sets, trigger expensive scans, or return 500s.
- **Affected area**: `app/api/customers/route.ts:24-29`, `lib/audit.ts:251-256`
- **Likelihood / Impact / Risk**: Medium / Medium / **Medium**
- **Effort estimate**: Low
- **Cost implication**: Low
- **Scope of fix**: Localised but the same helper should be reused everywhere.
- **Recommended fix**: Build the search using Supabase's `textSearch()` / `ilike()` chained per column instead of a raw `.or()`. If a single search across columns is required, use a server-side `tsvector` column populated by trigger and a single `.textSearch()` call. Either way, do not interpolate user input into the filter DSL.

### F10 — `EMAIL_CREDENTIAL_ENCRYPTION_KEY` derived via plain SHA-256

- **Description**: `lib/inbound-email/crypto.ts:6-14` derives the AES-256-GCM key with `createHash("sha256").update(secret).digest()`. If the env var is a 32-byte random secret this is fine; if it is a passphrase (which the project's env example does not bound) the result is brute-forceable. The encrypted IMAP passwords are stored in `inbound_email_accounts.password_encrypted`.
- **Affected area**: `lib/inbound-email/crypto.ts:6-39`
- **Likelihood / Impact / Risk**: Low / High / **Medium**
- **Effort estimate**: Low — switch to `scrypt` (built into `node:crypto`) with a stable per-deploy salt, or require a 32-byte base64 secret and assert length on boot.
- **Cost implication**: Low
- **Scope of fix**: Localised, but a key rotation will require re-encrypting existing rows.
- **Recommended fix**: Validate that the env var decodes to ≥ 32 random bytes (e.g. `Buffer.from(secret, "base64").length === 32`) and use it directly. If preserving passphrase support, switch to `scrypt(secret, salt, 32)` with a stable salt stored alongside the ciphertext envelope.

### F11 — Password policy minimum is 6 characters

- **Description**: `app/api/users/route.ts:20` and `app/api/users/[userId]/password/route.ts:58` allow passwords as short as 6 characters with no complexity requirement.
- **Affected area**: `app/api/users/route.ts:15-21`, `app/api/users/[userId]/password/route.ts:50-63`
- **Likelihood / Impact / Risk**: Medium / Medium / **Medium**
- **Effort estimate**: Low
- **Cost implication**: Low
- **Scope of fix**: Localised.
- **Recommended fix**: Raise minimum to 12 characters, reject the 100k most-common passwords (e.g. `zxcvbn-ts` strength score ≥ 3), and forward to Supabase's "leaked password protection" if available on the project tier.

### F12 — Cron endpoints depend on `CRON_SECRET` over Bearer; no constant-time compare

- **Description**: `app/api/cron/email-sync/route.ts:7` and `app/api/cron/pipeline-auto-close/route.ts:42` compare the request's `Authorization` header to ``Bearer ${process.env.CRON_SECRET}`` with `!==`. This is a timing-sensitive comparison. Vercel cron always invokes via TLS, so transport interception is not realistic, but the lack of constant-time comparison plus the absence of `Vercel-Cron` header validation means anyone who learns the secret can re-invoke the cron at will.
- **Affected area**: `app/api/cron/email-sync/route.ts:4-8`, `app/api/cron/pipeline-auto-close/route.ts:39-44`
- **Likelihood / Impact / Risk**: Low / Medium / **Medium**
- **Effort estimate**: Low
- **Cost implication**: Low
- **Scope of fix**: Localised.
- **Recommended fix**: Use `crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))` after a length check; additionally validate the Vercel-supplied `x-vercel-cron` header for an extra guard.

### F13 — `postcss<8.5.10` XSS via unescaped `</style>` (CVE-2026-41305)

- **Description**: Both `next > postcss@8.4.31` and `autoprefixer > postcss@8.5.6` are below the patched `8.5.10`. Severity moderate. Direct exploitability requires user-supplied CSS being parsed and re-stringified into HTML — the project does not appear to take that path, so the realistic risk is bounded to future regressions.
- **Affected area**: `pnpm-lock.yaml` (transitive)
- **Likelihood / Impact / Risk**: Low / Medium / **Medium**
- **Effort estimate**: Low — bumping `next` (F2) drags `postcss` along; for `autoprefixer`, add a `pnpm.overrides` for `postcss@^8.5.10`.
- **Cost implication**: Low
- **Scope of fix**: Localised.
- **Recommended fix**: After F2's `next` bump, add `"pnpm": { "overrides": { "postcss": "^8.5.10" } }` to `package.json` and re-resolve.

### F14 — Several read endpoints rely on RLS only and skip the explicit 401 gate

- **Description**: `GET /api/data` (`app/api/data/route.ts:13`), `GET /api/jobs/[id]` (`app/api/jobs/[id]/route.ts:58`), `GET /api/templates` (`app/api/templates/route.ts:4`), and others issue Supabase queries without first checking `auth.getUser()` and returning a `401`. RLS will still gate row access, but if RLS is ever weakened (e.g. a forgotten policy on a new table) these routes silently leak data instead of failing closed. CLAUDE.md explicitly mandates the 401 gate.
- **Affected area**: `app/api/data/route.ts`, `app/api/jobs/[id]/route.ts`, `app/api/templates/route.ts`
- **Likelihood / Impact / Risk**: Medium / Medium / **Medium**
- **Effort estimate**: Low
- **Cost implication**: Low
- **Scope of fix**: Localised but touches several routes.
- **Recommended fix**: Add the canonical pattern at the top of each route — fetch the user, return 401 if missing, then proceed. Consider extracting a `requireUser()` helper akin to `requireAdminSettingsAccess()`.

### F15 — Supabase / PostgREST error messages echoed straight to client

- **Description**: Many routes (`app/api/audit/route.ts:107`, `app/api/users/route.ts:91`, `app/api/jobs/[id]/route.ts:475`, `app/api/cron/...`) return `error.message` from Supabase directly. PostgREST/Postgres error messages can include constraint names, column names, or even partial values, leaking schema details.
- **Affected area**: Multiple `app/api/**/route.ts`
- **Likelihood / Impact / Risk**: High / Low / **Low–Medium**
- **Effort estimate**: Low
- **Cost implication**: Low
- **Scope of fix**: Cross-cutting (search-and-replace pattern).
- **Recommended fix**: Log the original error server-side and return a generic message client-side (e.g. `"Failed to load audit logs"`), keeping a `traceId` so users can quote it for support. The customers-import route already follows this pattern (`buildImportErrorResponse`).

### F16 — Hardcoded dev-quick-login emails + password `password123`

- **Description**: `app/login/page.tsx:14-100` ships a list of real luxustravel.co.za emails and a default password `password123` baked into the client bundle. The block is gated by `NODE_ENV === "development"`, so it should be tree-shaken in production, but Next.js `process.env.NODE_ENV` substitution sometimes leaves the strings inside the bundle for source-map readers.
- **Affected area**: `app/login/page.tsx:14-100`, `app/login/page.tsx:208-241`, `app/login/page.tsx:352-364`
- **Likelihood / Impact / Risk**: Low / Medium / **Low–Medium**
- **Effort estimate**: Low
- **Cost implication**: Low
- **Scope of fix**: Localised.
- **Recommended fix**: Move the dev block behind a build-time flag (e.g. import only when `process.env.NEXT_PUBLIC_DEV_QUICK_LOGIN === "1"`), and replace the hardcoded list with `process.env.NEXT_PUBLIC_DEV_QUICK_LOGIN_EMAIL` only. Ensure production `NEXT_PUBLIC_DEV_QUICK_LOGIN_*` env vars are unset.

### F17 — Admin password reset does not require fresh re-auth or MFA

- **Description**: `POST /api/users/[userId]/password` (`app/api/users/[userId]/password/route.ts`) lets any admin reset any other user's password using only the long-lived session cookie. There is no requirement to re-enter the admin's password and no support for MFA on sensitive operations.
- **Affected area**: `app/api/users/[userId]/password/route.ts`
- **Likelihood / Impact / Risk**: Low / Medium / **Low**
- **Effort estimate**: Medium — needs a re-auth dialog client-side and a server-side check (Supabase supports AAL2 via TOTP enrolment).
- **Cost implication**: Medium
- **Scope of fix**: Cross-cutting (admin UX + Supabase MFA).
- **Recommended fix**: Require a second password challenge for admin password resets and user deletions. If the project enables Supabase TOTP MFA, gate these routes on AAL2 (`supabase.auth.mfa.getAuthenticatorAssuranceLevel()`).

### F18 — `patchJobSchema.passthrough()` accepts arbitrary extra fields

- **Description**: `app/api/jobs/[id]/route.ts:56` ends the schema with `.passthrough()`, which allows any unrecognised JSON keys to flow through validation. The keys are not used downstream, but the pattern undermines the schema-strictness invariant the project claims.
- **Affected area**: `app/api/jobs/[id]/route.ts:29-56`
- **Likelihood / Impact / Risk**: Low / Low / **Low**
- **Effort estimate**: Low
- **Cost implication**: Low
- **Scope of fix**: Localised.
- **Recommended fix**: Replace `.passthrough()` with `.strict()` and remove any unused fields the front-end is sending.

## 4. Priority Actions

The following four items are the quickest wins for the current risk profile and should be addressed first:

1. **F2 — Bump `next` to `^16.2.3`.** One-line dependency upgrade closes a 7.5 RSC DoS plus five other CVEs. Smoke-test the App Router and Server Actions afterwards.
2. **F1 — Lock down `/api/enquiries`.** Add Zod validation, captcha, rate limit, and stop overwriting existing customers on email match. This single route is currently the largest external attack surface.
3. **F4 + F5 — Sanitise `templates.body_html` and gate `PATCH /api/templates`.** The chain of "any RLS-permitted writer can store HTML" + "admin renders it via `dangerouslySetInnerHTML`" is a textbook stored-XSS path. Adding `requireAdminSettingsAccess()` plus DOMPurify on the preview neutralises both ends cheaply.
4. **F7 — Replace the `Math.random()` mock in `/api/correspondence`** with the real send pipeline (or move the route behind a dev-only flag), and add the standard auth gate. Production correspondence behaviour should never be probabilistic.

After those, sweep up the medium-risk hygiene items in a single pass: F8 (auth + actor on payments), F9 (PostgREST filter escaping), F11 (raise password minimum), F14 (uniform 401 gate), and F15 (stop echoing PostgREST error messages). They are all low-effort, low-cost, and reinforce defence-in-depth.
