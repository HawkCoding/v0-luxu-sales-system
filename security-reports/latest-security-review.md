# Security Review — Luxus Sales System

| Field | Value |
| --- | --- |
| Repository | `hawkcoding/v0-luxu-sales-system` |
| Branch reviewed | `claude/friendly-curie-QhQda` |
| Run date | 2026-05-09 |
| Total findings | 9 |
| Highest-risk issue | Public `/api/enquiries` writes via service-role client without Zod validation, role/CAPTCHA, or rate limiting |
| Lowest-risk issue | ReDoS exposure via admin-supplied regex on inbound email subject rules |
| Overall security posture | **Moderate** |

---

## 1. Summary

- **Total vulnerabilities identified**: 9
- **Highest-risk**: `POST /api/enquiries` is the only public, unauthenticated mutation surface in the app, yet it parses `await req.json()` without Zod validation, persists records using `createServiceClient()` (RLS bypass), has no rate limiting / CAPTCHA, and accepts unbounded child arrays (`travellers`, `childTravellers`, `suiteTypes`, `transportRequests`). An attacker can poison customers/bookings/audit logs and drive denial of service or storage cost amplification.
- **Lowest-risk**: `lib/inbound-email/rules.ts` compiles admin-supplied regex against email subjects with no complexity guard, allowing a privileged user to set a pathological pattern that stalls the cron worker.
- **Overall posture**: **Moderate**. Authenticated API surface is consistently gated by `createSessionClient()` + `clearance_level` checks and validated with Zod. The main weaknesses are the unauthenticated intake route, the absence of HTTP hardening headers, and a few content/handling defects (stored-XSS preview, low password floor, PostgREST `or` injection in search).

---

## 2. Risk Matrix

| # | Issue | Likelihood | Impact | Risk Level |
| --- | --- | --- | --- | --- |
| 1 | Public `/api/enquiries` — no validation, no rate limit, service-role writes | High | High | **Critical** |
| 2 | Missing global HTTP security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy) | High | Medium | **High** |
| 3 | Stored XSS in template preview via `dangerouslySetInnerHTML` | Medium | High | **High** |
| 4 | PostgREST `or()` filter injection in `GET /api/customers` search | Medium | Medium | **Medium** |
| 5 | Weak password floor (6 chars) on user create + admin password reset | Medium | Medium | **Medium** |
| 6 | No CSRF defence beyond Supabase cookie `SameSite=Lax` default | Low | Medium | **Medium** |
| 7 | `POST /api/audit` lets any authenticated user write arbitrary `entity_type` / `entity_id` / `action` | Medium | Low | **Low–Medium** |
| 8 | `next.config.mjs` is minimal — `images.unoptimized = true` and no headers/CSP/poweredByHeader controls | Low | Low | **Low** |
| 9 | ReDoS via admin-supplied inbound email regex pattern | Low | Medium | **Low** |

---

## 3. Detailed Findings

### Finding 1 — Public `/api/enquiries` writes with no validation, throttling, or RLS

- **Description**: `app/api/enquiries/route.ts` is a public POST endpoint (web form + paste import). It (a) reads the body via `await req.json()` with no Zod schema, (b) uses `createServiceClient()` which bypasses RLS, (c) inserts into `customers`, `bookings`, `booking_suites`, `travellers`, `booking_transport_requests`, `quotes`, `quote_line_items`, and `audit_logs`, (d) loops over caller-controlled arrays (`body.travellers`, `body.childTravellers`, `body.suiteTypes`, `body.transportRequests`) typed as `any[]`, and (e) does not enforce any size cap, CAPTCHA, or per-IP rate limit. `body.email` is only `.toLowerCase().trim()`-ed; no email-format check. `body.purpose` falls through unmodified. `body.extractedJson` is shallow-merged into `extracted_json` without schema constraints.
- **Affected area**: `app/api/enquiries/route.ts:225-479`, `lib/supabase/server.ts:45-62` (service client).
- **Likelihood / Impact / Risk**: **High / High / Critical**.
- **Effort**: Medium.
- **Cost implication**: Medium (Zod schemas, ratelimit infra such as Upstash or Vercel rate limit).
- **Scope of fix**: Localised to the route + a shared `lib/api/rate-limit.ts` (cross-cutting if reused).
- **Recommended fix**:
  1. Add a strict `enquirySchema` with caps (e.g. `travellers: z.array(...).max(20)`, `transportRequests: z.array(...).max(10)`, `rawText: z.string().max(20_000)`, `email: z.string().email()`), plus an inner Zod schema for `extractedJson`.
  2. Reject any body where `purpose` / `source` / `stage` are caller-supplied (server should hard-code).
  3. Add per-IP rate limiting (e.g. `@upstash/ratelimit`, 5 req/min) and a hCaptcha/Turnstile token verification step.
  4. Keep `createServiceClient()` only after validation passes; consider running the inserts within a SECURITY DEFINER Postgres function so service-role usage is auditable.
  5. Strip `body.extractedJson` of unknown keys before persisting.

### Finding 2 — Missing global HTTP security headers

- **Description**: `next.config.mjs` is a 6-line stub. There is no `headers()` function and no middleware (`proxy.ts` is auth-only and does not set response headers). Responses ship without `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy`. `dangerouslySetInnerHTML` (Finding 3) is also unmitigated by CSP.
- **Affected area**: `next.config.mjs`, `proxy.ts`.
- **Likelihood / Impact / Risk**: **High / Medium / High**.
- **Effort**: Low.
- **Cost implication**: Low.
- **Scope of fix**: Localised to `next.config.mjs`.
- **Recommended fix**: Add a `headers()` function returning at minimum:
  ```js
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: "default-src 'self'; img-src 'self' https://*.supabase.co data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'" },
  ```
  Also set `poweredByHeader: false`. Adjust the CSP `connect-src` / `img-src` to match Supabase project domains.

### Finding 3 — Stored XSS in template preview (`dangerouslySetInnerHTML`)

- **Description**: `app/app/templates/page.tsx:185` renders `preview?.bodyHtml` via `dangerouslySetInnerHTML` with no sanitization. `bodyHtml` is editable through `PATCH /api/templates`. While the editor is gated by the `edit:templates` permission, the **preview** dialog is open to any user with template-list access; a malicious or compromised admin/manager can inject `<script>`/`onerror=` payloads that execute inside other staff sessions (CSP would not help — see Finding 2).
- **Affected area**: `app/app/templates/page.tsx:185`, `app/api/templates/route.ts` (write side).
- **Likelihood / Impact / Risk**: **Medium / High / High**.
- **Effort**: Low.
- **Cost implication**: Low.
- **Scope of fix**: Localised — the preview renderer + an outbound sanitizer.
- **Recommended fix**: Sanitize before render (`DOMPurify` on the client or `isomorphic-dompurify` shared with server-side preview), or render the HTML inside a sandboxed `<iframe sandbox>` so any injected JS executes in a null origin. Additionally, validate the body server-side at write time (strip `<script>`, event handlers, `javascript:` URLs).

### Finding 4 — PostgREST `or()` filter injection in customer search

- **Description**: `app/api/customers/route.ts:39-42` interpolates the user's `search` query into a PostgREST `or(...)` filter after escaping only `,`, `%`, and `_`. Parentheses, dots, and `\` are not escaped, allowing the caller to break out of the `ilike.%X%` value and append additional filters (e.g. `).id.eq.<uuid>`), bypassing the intended search shape. Authenticated users with valid sessions could enumerate customer rows by manipulating the filter, subject to RLS. This is not strictly SQL injection, but it is a PostgREST query-grammar injection.
- **Affected area**: `app/api/customers/route.ts:30-43`.
- **Likelihood / Impact / Risk**: **Medium / Medium / Medium**.
- **Effort**: Low.
- **Cost implication**: Low.
- **Scope of fix**: Localised.
- **Recommended fix**: Either (a) split into separate `.or()` builder calls using PostgREST's array form so the SDK escapes properly, or (b) reject any character outside `[\p{L}\p{N}@._\- ]` from `query`, or (c) push the search into an RPC (`search_customers(text)`) that executes a parameterised SQL statement.

### Finding 5 — Weak password floor on user create / admin password reset

- **Description**: Both `app/api/users/route.ts:20` (`createUserSchema.password.min(6)`) and `app/api/users/[userId]/password/route.ts:59` (`newPassword.length < 6`) enforce a 6-character minimum. NIST SP 800-63B recommends ≥ 8 characters and modern guidance recommends ≥ 12 for admin tools. There is also no breach-corpus check (HIBP) and no complexity / passphrase guidance. Combined with no MFA enforcement (Supabase Auth supports it, but nothing requires it) this is a real account-takeover lever.
- **Affected area**: `app/api/users/route.ts:15-21`, `app/api/users/[userId]/password/route.ts:58-64`.
- **Likelihood / Impact / Risk**: **Medium / Medium / Medium**.
- **Effort**: Low.
- **Cost implication**: Low.
- **Scope of fix**: Localised (two route files + UI copy).
- **Recommended fix**: Raise the minimum to 12, optionally check against the HIBP `range` API, and require MFA enrolment for `clearance_level = "admin"` and `"manager"` accounts via Supabase factors.

### Finding 6 — No CSRF defence beyond `SameSite=Lax`

- **Description**: All authenticated mutations rely solely on Supabase auth cookies. `SameSite=Lax` (the Supabase SSR default) blocks classic cross-site form submits, but does not block top-level navigations on `GET`-style state changes, browser extensions, or (in some browsers) `POST` from `iframe` ancestors when configured incorrectly. There is no double-submit token, no `Origin`/`Referer` allow-list check in `proxy.ts`, and the public enquiries endpoint (Finding 1) accepts JSON from any origin.
- **Affected area**: `proxy.ts`, all `app/api/**` routes.
- **Likelihood / Impact / Risk**: **Low / Medium / Medium**.
- **Effort**: Medium.
- **Cost implication**: Low.
- **Scope of fix**: Cross-cutting (a single helper invoked by every mutating route or middleware).
- **Recommended fix**: Add an `Origin` allow-list check in `proxy.ts` for non-`GET` requests against `app.luxustravel.co.za` (and the Vercel preview wildcard). Reject mismatching origins with `403`. Optionally add a CSRF token in a non-`HttpOnly` cookie that the API verifies.

### Finding 7 — `POST /api/audit` allows arbitrary entity payloads

- **Description**: `app/api/audit/route.ts:48-117` only checks that the caller is authenticated. Any authenticated user (including `readonly`) can write audit-log entries with arbitrary `entity_type`, `entity_id`, `action`, and JSON `before/after/meta` blobs (capped at 5 KB indirectly through `JSON.parse`). This lets a non-admin pollute the audit trail or fabricate "evidence" against another user. The `actor_user_id` is server-derived (good), but the textual `entity_*` columns are uncontrolled.
- **Affected area**: `app/api/audit/route.ts`.
- **Likelihood / Impact / Risk**: **Medium / Low / Low–Medium**.
- **Effort**: Low.
- **Cost implication**: Low.
- **Scope of fix**: Localised.
- **Recommended fix**: Restrict the route to a fixed allow-list of `entity_type`/`action` enums that the UI legitimately produces, OR move audit writes server-side and remove the route entirely. Add a `clearance_level !== "readonly"` gate at minimum.

### Finding 8 — `next.config.mjs` is minimal and disables image optimisation

- **Description**: `next.config.mjs` only sets `images.unoptimized: true`. This is not a vulnerability per se, but it disables Next.js' built-in protection against arbitrary remote image rendering and forfeits the ability to lock down `images.remotePatterns`. Combined with the absence of headers (Finding 2) and `poweredByHeader` not being disabled, the deployment leaks Next.js version info and lacks defence-in-depth for image-based SSRF.
- **Affected area**: `next.config.mjs`.
- **Likelihood / Impact / Risk**: **Low / Low / Low**.
- **Effort**: Low.
- **Cost implication**: Low.
- **Scope of fix**: Localised.
- **Recommended fix**: Re-enable image optimisation with explicit `remotePatterns` for the Supabase storage host(s) only, set `poweredByHeader: false`, and add the `headers()` block from Finding 2.

### Finding 9 — ReDoS via admin-supplied inbound email regex

- **Description**: `lib/inbound-email/rules.ts:21-27` compiles an admin-supplied `subjectPattern` with `new RegExp(pattern, "i")` and tests it against every inbound email subject during the cron sync (`/api/cron/email-sync`). A pattern such as `(a+)+$` against an attacker-crafted subject can stall the worker. Because admins set the rules and attackers control inbound subjects, this is a real ReDoS vector that can hang or time out the email-sync cron.
- **Affected area**: `lib/inbound-email/rules.ts:15-37`, `lib/inbound-email/sync.ts`.
- **Likelihood / Impact / Risk**: **Low / Medium / Low**.
- **Effort**: Low.
- **Cost implication**: Low.
- **Scope of fix**: Localised.
- **Recommended fix**: Either (a) replace `regex` matching with `safe-regex2` validation at write time and reject patterns deemed unsafe, (b) execute `RegExp.test` inside a `worker_threads` worker with a 50–100 ms timeout, or (c) drop the `regex` match type entirely and keep only `contains` + `exact`.

---

## 4. Priority Actions

Address in this order — the first two are the cheapest defence-in-depth wins:

1. **Finding 2 — Add HTTP security headers** (Low effort, broad impact). Implement immediately in `next.config.mjs`.
2. **Finding 1 — Lock down `/api/enquiries`** (Medium effort, highest impact). Add Zod schema, array caps, rate limit, and CAPTCHA. This is the single largest exposure.
3. **Finding 3 — Sanitize template preview**. Drop `dangerouslySetInnerHTML` or sandbox it.
4. **Finding 4 — Replace string-built `or()` filter** in customer search with safer parameterisation.
5. **Finding 5 — Raise password floor + require MFA for admins/managers**.
6. **Finding 6 — Add Origin allow-list to `proxy.ts`** for non-GET requests.
7. **Finding 7 — Constrain `POST /api/audit`** to enum-only entity types and disallow `readonly`.
8. **Finding 8 — Tighten `next.config.mjs`** (`poweredByHeader`, `images.remotePatterns`).
9. **Finding 9 — Replace or sandbox the regex matcher** in inbound email rules.

---

## Notes on Dependencies & Configuration

- `next` is on `16.1.6`, `react` on `19.2.4`, `@supabase/ssr` on `^0.8.0`, `@supabase/supabase-js` on `^2.98.0`, `zod` on `^3.24.1` — all current at the time of this review with no public CVEs that materially affect this codebase.
- `imapflow ^1.3.2`, `mailparser ^3.9.8`, `nodemailer ^8.0.7` are all on supported lines; no current advisories. Re-audit on every dependency bump (pnpm audit) — the codebase ingests untrusted email content (`mailparser`, IMAP attachments) so prompt patching matters here.
- `EMAIL_CREDENTIAL_ENCRYPTION_KEY` is consumed via `crypto.createHash("sha256")` to derive an AES-256-GCM key. Acceptable provided the key is ≥ 256 bits of entropy and rotated on incident; document key-rotation procedure in `NOTES.md`.
- `.gitignore` correctly excludes `.env*.local`, `.mcp.json`, `.claude/settings.local.json`. No secrets were found checked into the working tree during this scan.
- `vercel.json` cron paths (`/api/cron/email-sync`, `/api/cron/pipeline-auto-close`) require `Bearer ${CRON_SECRET}` — verified.

---

*Generated by automated security review for branch `claude/friendly-curie-QhQda` on 2026-05-09.*
