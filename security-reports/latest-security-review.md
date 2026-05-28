# Security Review — Luxus Sales System

| Field | Value |
| --- | --- |
| Repository | `hawkcoding/v0-luxu-sales-system` |
| Run date | 2026-05-28 |
| Branch reviewed | `claude/friendly-curie-6dtpU` (clean working tree) |
| App version | `3.07` (`lib/version.ts`) |
| Overall security posture | **Moderate** (one critical defense-in-depth gap; otherwise hardenable) |
| Highest-risk issue | Permissive RLS policies on core PII / financial tables (`USING (true)`) |
| Lowest-risk issue | SHA-256 used directly as KDF in `lib/inbound-email/crypto.ts` |
| Total findings | 14 |

---

## 1. Summary

- **Total vulnerabilities / findings:** 14
- **Highest-risk:** *Permissive RLS policies on core tables* — any authenticated user (incl. `readonly`) can read/write all customer, booking, payment, document, and audit-log rows via Supabase JS direct from the browser; API role checks become bypassable.
- **Lowest-risk:** *SHA-256 used as raw KDF for credential encryption* — acceptable if the master env secret is high-entropy, but doesn't follow KDF best practice (PBKDF2/HKDF/scrypt).
- **Overall posture:** **Moderate.** Authentication, Zod validation, and audit logging are mostly well-implemented in the API layer. However the **canonical Supabase control plane (RLS) is effectively disabled** for the most sensitive tables, the public enquiry intake endpoint is unauthenticated and unvalidated, and standard hardening (security headers, timing-safe secret comparison, CSP, rate limiting) is missing. None of these block production use, but the RLS finding meaningfully degrades the security baseline of the platform.

---

## 2. Risk Matrix

| # | Issue | Likelihood | Impact | Risk Level |
|---|---|---|---|---|
| 1 | Permissive RLS policies on `customers`, `bookings`, `documents`, `audit_logs`, `payments` | High | High | **Critical** |
| 2 | Public `POST /api/enquiries` uses service-role client w/ no Zod validation or rate limit | High | High | **High** |
| 3 | Stored XSS via email-template preview (`dangerouslySetInnerHTML` on `bodyHtml`) | Medium | High | **High** |
| 4 | PostgREST `.or()` string injection via customer search (incomplete escaping) | Medium | Medium | **Medium** |
| 5 | Cron-secret comparison is not timing-safe | Low | Medium | **Medium** |
| 6 | No security response headers (CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy) | High | Medium | **Medium** |
| 7 | Weak password policy (≥ 6 chars) on user create + admin password reset | Medium | Medium | **Medium** |
| 8 | `proxy.ts` is named/exported incorrectly — Next.js middleware never runs | High | Low | **Medium** |
| 9 | `/api/data` returns full CRM dump to any authenticated user (no role gate, no `is_active` check on caller) | High | Medium | **Medium** |
| 10 | CSS injection sink in `components/ui/chart.tsx` (unsanitised colour interpolation into `<style>`) | Low | Medium | **Low** |
| 11 | SHA-256 used as raw KDF for IMAP/SMTP credential encryption | Low | Low | **Low** |
| 12 | Dev quick-login hardcodes real employee emails + `password123` (gated to NODE_ENV=development) | Low | Low | **Low** |
| 13 | Customer-import endpoint leaks internal error details when `NODE_ENV !== "production"` | Low | Low | **Low** |
| 14 | `linked-remote-types.tmp.ts` (86 kB schema dump) committed to repo | Low | Low | **Low** |

Ranked most-to-least severe: **1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14**.

---

## 3. Detailed Findings

### Finding 1 — Permissive RLS policies on core tables  *(Critical)*

- **Description.** The initial schema migration defines RLS policies that allow **any** authenticated role to `SELECT`, `INSERT`, `UPDATE`, `DELETE` on `customers`, `bookings`, `documents`, `audit_logs`, `payments`, `correspondences`, `quotes`, `quote_line_items`, `booking_suites`, `itineraries`, `pipeline_history`. The policies are `USING (true) WITH CHECK (true)`. Roles like `readonly` and `consultant` are only enforced inside API route handlers, never at the database. A signed-in user can call Supabase JS directly with their JWT (`getSupabase()` uses the `anon` key and the session cookie) and exfiltrate or mutate every row.
- **Affected area.** `supabase/migrations/20260308095136_remote_schema.sql:1168–1315` (and corresponding `ENABLE ROW LEVEL SECURITY` at 1339–1401).
- **Likelihood / Impact / Risk.** High / High / **Critical**
- **Effort estimate.** Medium — design tightened policies (e.g. role-based via `auth_has_role(...)`, restrict `audit_logs` writes to service role, scope `payments`/`bookings` SELECT to admin/manager/consultant only, gate DELETE to admin). Roll out a migration and update tests.
- **Cost implication.** Medium — careful policy authoring + regression testing required; potential to surface places that depend on permissive writes.
- **Scope of fix.** Cross-cutting (database + API + tests).
- **Recommended fix.**
  1. Replace `biz_select/insert/update/delete` with role-gated policies using the existing `public.auth_has_role(...)` helper, e.g. `USING (public.auth_has_role(ARRAY['admin','manager','consultant']))`. Block `readonly` from writes.
  2. Restrict `audit_logs` INSERT/UPDATE/DELETE to the service role only; allow SELECT to admin/manager.
  3. Add WITH CHECK clauses that prevent users from modifying rows they don't own where applicable (e.g. `assigned_salesperson_id = auth.uid()` or owner check on `bookings`).
  4. Add a regression test that uses the anon key + a low-privilege JWT to confirm key reads/writes are now denied.

### Finding 2 — Public enquiry intake uses service-role client without validation or rate limit  *(High)*

- **Description.** `POST /api/enquiries` (`app/api/enquiries/route.ts:410`) is the public web-form intake. It calls `createServiceClient()`, which bypasses RLS. The body is read with `await req.json()` and passed through ad-hoc normalisers — **no Zod schema** is applied. Anyone on the internet can:
  - Insert arbitrary rows into `customers`, `bookings`, `booking_suites`, `travellers`, `booking_transport_requests`, `booking_vehicle_rental_details`, `quotes`, and `audit_logs`.
  - Overwrite `extracted_json` (an unstructured `Json` column) with attacker-controlled content (line 528), seeding stored-data attacks for downstream consumers.
  - Spam the pipeline with bogus enquiries (no CAPTCHA, no IP rate limit).
  - Write `audit_logs.actor` = `"consultant"` or `"system"` (lines 663, 677) without an actor user id, polluting the audit trail.
- **Affected area.** `app/api/enquiries/route.ts:410–702`.
- **Likelihood / Impact / Risk.** High / High / **High**
- **Effort estimate.** Medium.
- **Cost implication.** Low–Medium.
- **Scope of fix.** Localised to one route + a shared rate-limit helper.
- **Recommended fix.**
  1. Add a strict Zod schema for the public payload (whitelist allowed top-level keys; cap string lengths; reject unknown keys via `.strict()`).
  2. Add IP/origin rate limiting (e.g. `@upstash/ratelimit` against Vercel KV) — start at 5 enquiries / 10 min / IP, 50 / day / IP.
  3. Add CAPTCHA (Turnstile/hCaptcha) on the public form and verify server-side before accepting.
  4. Stop accepting client-supplied `extractedJson` — derive it server-side or restrict to a small allow-list of fields.
  5. Always write `audit_logs.actor = "public_intake"` and never trust client-derived actor values; never default to `"consultant"` or `"system"` without an authenticated session.

### Finding 3 — Stored XSS in email-template preview (`dangerouslySetInnerHTML`)  *(High)*

- **Description.** `app/app/templates/page.tsx:185` renders `preview?.bodyHtml` via `dangerouslySetInnerHTML`. Templates are editable by anyone with template-write access; any HTML/JS injected into `body_html` runs in the browser of every staff member who opens the preview. The same `body_html` is also delivered as an email to customers, so a compromised consultant can phish admins (script in preview executes in the staff session) and customers in one go.
- **Affected area.** `app/app/templates/page.tsx:185`. (The other `dangerouslySetInnerHTML` use, `components/ui/chart.tsx:83`, is finding #10.)
- **Likelihood / Impact / Risk.** Medium / High / **High**
- **Effort estimate.** Low.
- **Cost implication.** Low.
- **Scope of fix.** Localised.
- **Recommended fix.** Render template previews inside a sandboxed `<iframe sandbox="allow-same-origin">` with `srcDoc` (so scripts can't execute and can't reach the parent), or sanitise `bodyHtml` with `DOMPurify` before injecting. Pair with a strict CSP (finding #6) so any future injection is contained.

### Finding 4 — PostgREST `.or()` string injection in customer search  *(Medium)*

- **Description.** `app/api/customers/route.ts:44-49` builds the `.or(...)` filter from `?search=` after escaping only `,`, `%`, `_`. PostgREST `.or()` is a mini DSL — characters such as `(`, `)`, `.`, and `:` are syntactically significant and **are not escaped**. An authenticated user can craft a query string that injects extra predicates into the `OR` expression, broadening what they read (still constrained to whatever the (permissive) RLS allows — see finding #1, which makes this materially worse). Same pattern is present at `app/api/locations/route.ts:162` (using a UUID `id` — server-controlled, safer) and at `app/api/packages/[slug]/helpers.ts:56`, `app/api/suppliers/route.ts:30` (using server-derived `slugBase`).
- **Affected area.** `app/api/customers/route.ts:44-49`.
- **Likelihood / Impact / Risk.** Medium / Medium / **Medium**
- **Effort estimate.** Low.
- **Cost implication.** Low.
- **Scope of fix.** Localised.
- **Recommended fix.** Build the `.or()` clause from sanitised values (drop or whitespace-substitute `()`, `,`, `:`, `.`, `\`) **and** wrap each value in PostgREST double quotes (`"…"`), with embedded `"` and `\` escaped. Alternatively, run separate `.ilike()` queries per field and `Union` the results in application code.

### Finding 5 — Cron-secret comparison is not timing-safe  *(Medium)*

- **Description.** `app/api/cron/email-sync/route.ts:7`, `app/api/cron/pipeline-auto-close/route.ts:42`, `app/api/cron/payment-reminders/route.ts:8` all use `authHeader !== \`Bearer ${process.env.CRON_SECRET}\``. JS string compare short-circuits on first mismatched character, leaking the secret one byte at a time under repeated probing. With Vercel's network jitter this is hard to exploit in practice, but trivial to fix.
- **Affected area.** Three cron route handlers above.
- **Likelihood / Impact / Risk.** Low / Medium / **Medium**
- **Effort estimate.** Low.
- **Cost implication.** Low.
- **Scope of fix.** Localised (introduce a single helper).
- **Recommended fix.** Add a shared helper that uses `crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))` after length comparison. Reject the request with 401 (not 500) when the header is malformed.

### Finding 6 — Missing security response headers  *(Medium)*

- **Description.** `next.config.mjs` exports only `images.unoptimized: true`. `vercel.json` defines no headers. The app therefore ships without:
  - `Content-Security-Policy`
  - `X-Frame-Options` / `frame-ancestors`
  - `Referrer-Policy`
  - `Permissions-Policy`
  - `X-Content-Type-Options: nosniff`
- **Affected area.** `next.config.mjs`, `vercel.json` (project-wide).
- **Likelihood / Impact / Risk.** High / Medium / **Medium**
- **Effort estimate.** Low.
- **Cost implication.** Low.
- **Scope of fix.** Localised (one config file).
- **Recommended fix.** Add a `headers()` block in `next.config.mjs` (or `vercel.json`) applying:
  - `Content-Security-Policy: default-src 'self'; img-src 'self' data: https://*.supabase.co; script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - `X-Content-Type-Options: nosniff`
  Trim CSP to actual external origins (Supabase, Vercel Analytics, Resend tracking pixels if any). Test thoroughly in staging since the templates page already injects HTML.

### Finding 7 — Weak password policy on user create + admin password reset  *(Medium)*

- **Description.** `app/api/users/route.ts:20` enforces `password: z.string().min(6, ...)`. The admin password-reset endpoint (`app/api/users/[userId]/password/route.ts:59`) enforces the same 6-character minimum. Modern guidance (NIST SP 800-63B) is ≥ 8 chars minimum; production guidance for business systems is typically ≥ 12.
- **Affected area.** Two routes above. (Self-service signup uses Supabase Auth defaults — also worth raising on the Supabase dashboard.)
- **Likelihood / Impact / Risk.** Medium / Medium / **Medium**
- **Effort estimate.** Low.
- **Cost implication.** Low.
- **Scope of fix.** Localised.
- **Recommended fix.** Raise both schemas to `min(12)` and add a check against a small blocklist of common passwords (or call `zxcvbn`-style strength check). Mirror the same minimum in Supabase Auth's password settings.

### Finding 8 — `proxy.ts` is named incorrectly and never runs as middleware  *(Medium)*

- **Description.** `/proxy.ts` exports `proxy()` and a `config.matcher`. Next.js only recognises a root-level file named `middleware.ts/js` exporting `middleware`. This file is therefore dead code. Practical consequences:
  - Supabase auth refresh does not run between requests — sessions rely solely on `createSessionClient()` re-validating per call.
  - The `/login` → `/app` redirect for already-signed-in users does not fire.
  - The stale-refresh-token cookie cleanup (`clearSupabaseCookies`) never executes.
- **Affected area.** `proxy.ts:29`, `proxy.ts:81`.
- **Likelihood / Impact / Risk.** High / Low / **Medium** (functional issue with a security-tinged side: leftover `sb-*` cookies persist longer than intended).
- **Effort estimate.** Low.
- **Cost implication.** Low.
- **Scope of fix.** Localised.
- **Recommended fix.** Rename the file to `middleware.ts` and rename the export to `middleware`. Verify locally that signed-in users are redirected from `/login` and that the matcher excludes static assets correctly.

### Finding 9 — `/api/data` returns full CRM dump to any authenticated user  *(Medium)*

- **Description.** `app/api/data/route.ts:28` authenticates via `getUser()` but does **not** check `profiles.is_active` and does not gate by role (except audit-log inclusion). It then issues 13 parallel queries returning customers, bookings, payments, quotes, line items, itineraries, documents, correspondences, pipeline history, templates, and (for admin/manager) up to 1 000 audit-log rows. Combined with finding #1 (RLS = `USING (true)`), even a deactivated/`readonly` user can pull the entire CRM via the SWR-hydrated dashboard.
- **Affected area.** `app/api/data/route.ts:28-342`.
- **Likelihood / Impact / Risk.** High / Medium / **Medium**
- **Effort estimate.** Medium.
- **Cost implication.** Medium.
- **Scope of fix.** Localised but high-traffic (front-end already depends on the shape).
- **Recommended fix.** (1) Use `requireUser()` so deactivated profiles are rejected. (2) Project columns to the minimum each role needs (a `consultant` doesn't need full payment notes, refund refs, audit metadata, etc.). (3) Paginate / filter where the UI does — full-table dumps shouldn't power per-page screens. (4) Add role gates: `readonly` should not receive `payments`, `audit_logs`, or financial fields on bookings.

### Finding 10 — CSS injection sink in `components/ui/chart.tsx`  *(Low)*

- **Description.** `components/ui/chart.tsx:83` builds a `<style>` block via `dangerouslySetInnerHTML` from `config[key].color` and `config[key].theme[...]`. The strings are interpolated raw with no escaping. Today the chart configs are hard-coded in the codebase, so impact is theoretical. If a future change wires user-/DB-controlled theme colours into the same prop, a payload like `red}</style><script>…` would escape the style block and execute.
- **Affected area.** `components/ui/chart.tsx:81-99`.
- **Likelihood / Impact / Risk.** Low / Medium / **Low**
- **Effort estimate.** Low.
- **Cost implication.** Low.
- **Scope of fix.** Localised.
- **Recommended fix.** Validate that each colour is a safe CSS token (regex `^#[0-9a-fA-F]{3,8}$` or `^(rgb|hsl)a?\\(…\\)$` etc.) before interpolation, or move colour assignments to inline `style={{ '--color-x': value }}` on each chart container, where React escapes them.

### Finding 11 — SHA-256 used as raw KDF for credential encryption  *(Low)*

- **Description.** `lib/inbound-email/crypto.ts:13` derives the AES-256-GCM key by SHA-256-ing `EMAIL_CREDENTIAL_ENCRYPTION_KEY`. There is no salt, no iteration count, and no domain separation. If the env value is high-entropy random (≥ 32 bytes base64), this is functionally equivalent to using the secret directly; if anyone ever sets it to a passphrase it becomes guessable.
- **Affected area.** `lib/inbound-email/crypto.ts:6-14`.
- **Likelihood / Impact / Risk.** Low / Low / **Low**
- **Effort estimate.** Low.
- **Cost implication.** Low.
- **Scope of fix.** Localised.
- **Recommended fix.** Switch to `crypto.hkdfSync('sha256', secret, salt, 'luxus-imap-credentials-v1', 32)` with a static, code-baked `salt`. Document the env var requirement (≥ 32 bytes from `openssl rand -base64 32`) in `.env.local.example`.

### Finding 12 — Dev quick-login hardcodes real employee emails + `password123`  *(Low)*

- **Description.** `app/login/page.tsx:16-23` lists 5 real-looking `@luxustravel.co.za` addresses and the password `password123`. The feature is gated on `process.env.NODE_ENV === "development"` so the strings are tree-shaken out of production bundles, but the values are still readable in the public source tree.
- **Affected area.** `app/login/page.tsx:14-100`, `app/login/page.tsx:208-241`.
- **Likelihood / Impact / Risk.** Low / Low / **Low**
- **Effort estimate.** Low.
- **Cost implication.** Low.
- **Scope of fix.** Localised.
- **Recommended fix.** Move all dev quick-login addresses behind env vars (`NEXT_PUBLIC_DEV_QUICK_LOGIN_EMAIL`) with no hardcoded defaults. Ensure local Supabase seed data uses these env-supplied users; never publish real production-looking addresses in the repo.

### Finding 13 — Customer-import endpoint leaks internal error details outside production  *(Low)*

- **Description.** `app/api/customers/import/route.ts:66-87` returns `phase`, `traceId`, and raw Supabase error `message`, `code`, `details`, `hint` whenever `NODE_ENV !== "production"`. Acceptable if every deployed environment sets `NODE_ENV=production`, but a preview/staging deploy with the wrong env would leak schema details to callers.
- **Affected area.** `app/api/customers/import/route.ts:66-90`.
- **Likelihood / Impact / Risk.** Low / Low / **Low**
- **Effort estimate.** Low.
- **Cost implication.** Low.
- **Scope of fix.** Localised.
- **Recommended fix.** Gate the verbose response on a distinct boolean (e.g. `process.env.ENABLE_VERBOSE_ERRORS === "1"`) defaulted off, set only on local. Always log full detail server-side via `console.error`.

### Finding 14 — `linked-remote-types.tmp.ts` (86 kB schema dump) committed to repo  *(Low)*

- **Description.** A 86 022-byte schema dump is checked in. It's plain types so not directly secret, but it leaks remote schema layout to anyone with read access, and the `.tmp.ts` suffix suggests it was never meant to live in git.
- **Affected area.** `/linked-remote-types.tmp.ts`.
- **Likelihood / Impact / Risk.** Low / Low / **Low**
- **Effort estimate.** Low.
- **Cost implication.** Low.
- **Scope of fix.** Localised.
- **Recommended fix.** `git rm` the file, add a matching ignore (`linked-remote-types.tmp.ts` or `*.tmp.ts`) to `.gitignore`, and document the proper generated location (presumably `lib/supabase/types.ts` via `pnpm db:types`).

---

## 4. Priority Actions

Tackle in this order — first three are the highest risk-vs-effort wins.

1. **Tighten RLS on core tables (#1).** Highest impact: removes the most realistic data-exfiltration path. Medium effort, but the policy template (`auth_has_role`) already exists in the schema.
2. **Lock down `POST /api/enquiries` (#2).** Strict Zod schema, IP rate limit, CAPTCHA, and remove client-supplied `extractedJson`/actor fields. Stops audit-log spoofing and DB spam.
3. **Sandbox or sanitise template preview (#3).** Wrap the rendered HTML in a sandboxed iframe (or DOMPurify it). Closes the cross-staff stored-XSS surface in one short PR.
4. Add response headers (#6) and switch cron-secret compare to `timingSafeEqual` (#5) — both ~10-line changes; pair them.
5. Fix `.or()` escaping in customer search (#4).
6. Raise password minimum to 12 chars (#7) and rename `proxy.ts` → `middleware.ts` (#8).
7. Restrict `/api/data` (#9) — at minimum, enforce `is_active` and scope columns by role.
8. Sweep remaining low-risk items (#10–#14) opportunistically.

---

*No application code was modified by this review. All recommendations are advisory and require human sign-off before merging.*
