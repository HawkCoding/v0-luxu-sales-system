# Security Review — Luxus Sales System

| Field | Value |
| --- | --- |
| Repository | `hawkcoding/v0-luxu-sales-system` |
| Run date | 2026-05-16 |
| Branch reviewed | `claude/friendly-curie-jPfCX` (HEAD `e14dceb`) |
| Overall security posture | **Poor** |
| Highest-risk issue | Next.js 16.1.6 chained CVEs (unauthenticated middleware/proxy bypass + SSRF + DoS) |
| Lowest-risk issue | Test credentials documented in `Browser test local app QA.md` |
| Total findings | **17** (5 High, 9 Medium, 3 Low) |

---

## 1. Summary

- **Total findings:** 17
- **Highest-risk issue:** Next.js `16.1.6` is affected by 22 advisories (9 of them High), including a Middleware/Proxy bypass via segment-prefetch (`GHSA-...`), SSRF via WebSocket upgrades, DoS via Server Components, and several XSS/cache-poisoning issues. All are fixed by `>=16.2.6`.
- **Lowest-risk issue:** Default test credentials are mentioned in `Browser test local app QA.md`. They match the local-only seed data and are not production secrets, but committing them increases the social-engineering surface.
- **Overall posture:** Poor. Authentication and per-route auth checks are mostly in place, but the foundation (RLS, dependency hygiene, password policy, an unauthenticated public intake endpoint that bypasses RLS) leaves the system materially exposed.

---

## 2. Risk Matrix

| # | Issue | Likelihood | Impact | Risk Level |
|---|-------|------------|--------|------------|
| 1 | Next.js 16.1.6 chained CVEs (`pnpm audit` reports 9 High) | High | High | **Critical** |
| 2 | Overly permissive RLS policies (`USING (true)` for nearly every business table) | High | High | **High** |
| 3 | Public unauthenticated `/api/enquiries` writes via service-role client (no rate limit, no Zod, no CAPTCHA) | High | High | **High** |
| 4 | Weak password policy (6 chars, no complexity, no MFA enforcement) | Medium | High | **High** |
| 5 | Transitive lodash `<4.18.0` code injection (`_.template`) and PostCSS `<8.5.10` XSS | Medium | High | **High** |
| 6 | SVG uploads accepted into a **public** `voucher-assets` bucket (`/api/voucher-template/upload`) | Medium | Medium | **Medium** |
| 7 | Stored-HTML render via `dangerouslySetInnerHTML` in `app/app/templates/page.tsx:185` | Medium | Medium | **Medium** |
| 8 | Open-redirect heuristic in `app/auth/callback/route.ts` (`getSafeNextPath` accepts protocol-relative paths) | Medium | Medium | **Medium** |
| 9 | No security headers (CSP/HSTS/X-Frame-Options/X-Content-Type-Options/Referrer-Policy) configured | Medium | Medium | **Medium** |
| 10 | PostgREST `.or()` filters use minimally-escaped user input (`app/api/customers/route.ts:40`, `lib/audit.ts:253`) | Low | Medium | **Medium** |
| 11 | Postgres error details leaked to clients (`details: ...` payloads, e.g. `app/api/users/route.ts:174`) | Medium | Low | **Medium** |
| 12 | Service-role client used for cron + public intake widens blast radius if those routes are abused | Low | High | **Medium** |
| 13 | `patchJobSchema` uses `.passthrough()` (`app/api/jobs/[id]/route.ts:75`) | Low | Medium | **Medium** |
| 14 | Cron auth is a static bearer (`CRON_SECRET`) on `GET`, with no rotation guidance | Low | Medium | **Medium** |
| 15 | Supabase local config has `enable_signup = true`, `enable_confirmations = false`, no captcha | Low | Medium | **Low** |
| 16 | Dev-only quick-login UI shipped behind `NODE_ENV` check (relies on build tree-shaking) | Low | Medium | **Low** |
| 17 | Test credentials and seed login documented in `Browser test local app QA.md` and `supabase/seed.sql` | Low | Low | **Low** |

---

## 3. Detailed Findings

### 1. Next.js 16.1.6 — multiple Critical/High CVEs

- **Description:** `pnpm audit --prod` against `next@16.1.6` returns 22 advisories, including 9 High severity. Notable ones: Middleware/Proxy bypass via segment-prefetch routes, Middleware/Proxy bypass via dynamic route param injection (`GHSA-...`), SSRF in apps using WebSocket upgrades, DoS via Server Components and Cache Components, HTTP request smuggling in rewrites (`CVE-2026-29057`), XSS via CSP nonces, XSS via `beforeInteractive` scripts, and cache poisoning of RSC responses. The proxy middleware in `proxy.ts` is reached on essentially every non-asset request, so the bypass classes apply broadly.
- **Affected area:** `package.json` (`next@16.1.6`), `proxy.ts`, every `app/app/**` server-rendered route, image optimisation.
- **Likelihood / Impact / Risk:** High / High / **Critical**.
- **Effort estimate:** Low (`pnpm up next@latest`).
- **Cost implication:** Low.
- **Scope of fix:** Localised (one dependency bump), but warrants regression testing.
- **Recommended fix:** Upgrade `next` to `^16.2.6` (or latest stable in the 16.x line), run `pnpm install`, re-run `pnpm audit`, smoke-test login + booking flow, and ship.

### 2. Overly permissive Postgres RLS policies

- **Description:** `supabase/migrations/20260308095136_remote_schema.sql` creates select/insert/update/delete policies on `bookings`, `customers`, `quotes`, `quote_line_items`, `invoices`, `payments`, `documents`, `correspondences`, `audit_logs`, `travellers`, `itineraries`, `booking_suites` etc. with `TO "authenticated" USING (true) WITH CHECK (true)`. That means once any user holds a valid Supabase JWT (including `readonly`), they can read **and delete** every row in the system by calling Supabase directly with the anon key — bypassing all API-route role checks.
- **Affected area:** Database security model; every business table in the public schema.
- **Likelihood / Impact / Risk:** High / High / **High**.
- **Effort estimate:** Medium (new migration to rewrite policies per-role and per-owner).
- **Cost implication:** Medium.
- **Scope of fix:** Cross-cutting — all sensitive tables.
- **Recommended fix:** Replace the blanket `USING (true)` policies with role-aware policies that read the JWT (`auth.jwt()->>'clearance_level'`) or the per-row owner (`assigned_salesperson_id = auth.uid()`). At minimum, gate DELETE/UPDATE to manager/admin, and restrict SELECT on `customers`/`payments`/`audit_logs` to roles allowed by the UI. Keep the `service_role` policies for intake/cron.

### 3. Public, unauthenticated `/api/enquiries` writes via service-role client

- **Description:** `app/api/enquiries/route.ts` POST handler uses `createServiceClient()` (RLS bypass) and accepts arbitrary unauthenticated input. There is no Zod validation, no rate limiting, no CAPTCHA, and no size limit. Each request creates/updates `customers`, inserts `bookings`, `booking_suites`, `travellers`, `booking_transport_requests`, `booking_vehicle_rental_details`, a draft `quote`, `quote_line_items` and an `audit_logs` row. An attacker can flood the DB, poison customer matching (the route updates an existing customer keyed on email with whatever first/last name and country the attacker supplies — `lines 339–352`), and exhaust storage.
- **Affected area:** `app/api/enquiries/route.ts`.
- **Likelihood / Impact / Risk:** High / High / **High**.
- **Effort estimate:** Medium.
- **Cost implication:** Low/Medium (Vercel/CDN rate-limiting + adding hCaptcha/Turnstile).
- **Scope of fix:** Localised, but touches form pages too if a CAPTCHA token is required.
- **Recommended fix:** (a) Add a Zod schema for the body and reject everything that fails validation. (b) Add CAPTCHA (`hcaptcha`/`turnstile`) and verify the token server-side before any DB write. (c) Add IP-based rate limiting (Vercel KV, Upstash, or Edge Config). (d) On the customer upsert path, do **not** overwrite existing names/country/phone for unauthenticated submissions — only create when missing, otherwise queue for staff review.

### 4. Weak password policy + no MFA

- **Description:** `app/api/users/route.ts` (`createUserSchema`) and `app/api/users/[userId]/password/route.ts` both accept passwords with `min(6)` and no complexity. Supabase local config (`supabase/config.toml`) shows `minimum_password_length = 6` and `password_requirements = ""`. MFA is disabled (`[auth.mfa.totp] enroll_enabled = false`, `verify_enabled = false`). Combined with Findings 2 (RLS) and 5 (intake), credential stuffing is the easiest path to a full data breach.
- **Affected area:** `app/api/users/route.ts:20`, `app/api/users/[userId]/password/route.ts:59`, `supabase/config.toml:189–193, 300–315`, `app/auth/set-new-password/page.tsx:33`.
- **Likelihood / Impact / Risk:** Medium / High / **High**.
- **Effort estimate:** Low (raise minimum, add zxcvbn-style strength check; enable TOTP) — Medium if MFA needs UX.
- **Cost implication:** Low.
- **Scope of fix:** Cross-cutting (API + UI + Supabase project settings).
- **Recommended fix:** Raise minimum to 12, set `password_requirements = "lower_upper_letters_digits_symbols"` (and the equivalent in the hosted Supabase dashboard), reject the password if it appears in HIBP top-100k. Enable Supabase TOTP MFA at least for `admin` and `manager`.

### 5. lodash & PostCSS dependency CVEs

- **Description:** `pnpm audit --prod` reports `lodash` **<= 4.17.23** with code injection via `_.template` (High, `GHSA-jf85-cpcp-j695`) and prototype pollution in `_.unset`/`_.omit` (Moderate, `GHSA-...`), pulled transitively. `postcss` **< 8.5.10** is also reported with XSS via unescaped `</style>` in CSS stringify output (Moderate).
- **Affected area:** Transitive deps (likely via `@react-pdf/renderer`, `tailwindcss`, etc.).
- **Likelihood / Impact / Risk:** Medium / High / **High**.
- **Effort estimate:** Low/Medium (`pnpm up` + `pnpm.overrides` in `package.json` if needed).
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Add `pnpm.overrides` to pin `lodash >= 4.18.0` and `postcss >= 8.5.10`, run `pnpm install`, re-run audit, smoke-test PDF generation and Tailwind build.

### 6. SVG uploads into a public bucket

- **Description:** `app/api/voucher-template/upload/route.ts:9–28` allows `image/svg+xml` uploads via the admin-only voucher template editor, and `supabase/config.toml:121–124` configures the `voucher-assets` bucket as **public** with `allowed_mime_types` including `image/svg+xml`. SVGs can carry inline `<script>` or `javascript:` URIs; when served from the bucket and embedded by users (or opened directly), this is stored XSS — admin-to-everyone.
- **Affected area:** `app/api/voucher-template/upload/route.ts`, `supabase/config.toml`, voucher rendering paths.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**.
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Drop `image/svg+xml` from the accepted mime list and from `allowed_mime_types`; force the cropped raster paths only. If SVG must stay, run uploads through DOMPurify (with `USE_PROFILES: { svg: true, svgFilters: true }`) and serve them with `Content-Disposition: attachment` + `Content-Security-Policy: sandbox`.

### 7. Stored HTML rendered via `dangerouslySetInnerHTML`

- **Description:** `app/app/templates/page.tsx:185` renders the email template `bodyHtml` value directly with `dangerouslySetInnerHTML` for preview. Templates are admin-editable, so a malicious or compromised admin/manager could plant a payload that fires in any teammate's browser session when previewing.
- **Affected area:** `app/app/templates/page.tsx:185`.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**.
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Render previews inside a sandboxed `<iframe srcDoc={...} sandbox="allow-same-origin" csp="...">`, **or** sanitise the HTML with DOMPurify before injecting. Apply the same care anywhere `bodyHtml` is rendered into the customer/job UI.

### 8. Open-redirect-adjacent behaviour in `/auth/callback`

- **Description:** `app/auth/callback/route.ts:4–7` only checks `rawNext.startsWith("/")`. Inputs like `//evil.example.com/x`, `/\evil.example.com`, or `/%2f%2fevil.example.com` may produce a redirect target that some browsers resolve as a different origin. Even though `NextResponse.redirect` normalises some of these, relying on string-prefix alone is fragile.
- **Affected area:** `app/auth/callback/route.ts:4`.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**.
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Validate against a fixed allow-list of paths (`/app`, `/auth/set-new-password`, …) or parse with `new URL(rawNext, origin)` and verify `result.origin === origin && !rawNext.startsWith("//") && !rawNext.startsWith("/\\")`.

### 9. No security headers

- **Description:** `next.config.mjs` only configures `images.unoptimized`. There is no `headers()` block, no CSP, no HSTS, no `X-Content-Type-Options: nosniff`, no `Referrer-Policy`, no `Permissions-Policy`. Combined with Finding 7 and the SVG concern in Finding 6, the lack of CSP removes a defence-in-depth control against XSS.
- **Affected area:** `next.config.mjs`, all responses.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**.
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised (one config file).
- **Recommended fix:** Add a `headers()` block in `next.config.mjs` (or use middleware) that sets `Content-Security-Policy` (start in `Content-Security-Policy-Report-Only`), `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, and a conservative `Permissions-Policy`.

### 10. PostgREST `.or()` filters built from user input

- **Description:** `app/api/customers/route.ts:38–43` and `lib/audit.ts:251–256` build `or=(...)` filter strings from user-supplied search text. Escaping is limited to `%`, `_`, and stripping `,`. Reserved PostgREST characters (`)`, `(`, `:`, `.`) are not escaped. While Supabase-js URL-encodes the resulting string, the filter grammar is still attacker-influenced and could be made to expand the matched column set or trigger unexpected behaviour.
- **Affected area:** `app/api/customers/route.ts:38–43`, `lib/audit.ts:251–256`.
- **Likelihood / Impact / Risk:** Low / Medium / **Medium**.
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Build the filter list with `.or([...])` arrays (when Supabase-js supports it) or pre-validate `query` against `/^[\p{L}\p{N}\s@._-]{1,80}$/u` before composing the filter. Also `replaceAll(")", "")`, `replaceAll("(", "")`, `replaceAll(":", " ")`.

### 11. Postgres error details leaked in responses

- **Description:** `app/api/users/route.ts:171–177` returns `details: profileError.message`. Several other routes return raw `error.message` from Supabase/Postgres (e.g. `app/api/jobs/[id]/route.ts:543, 556, 723`, `app/api/cron/pipeline-auto-close/route.ts:58, 73, 110, 122`). Postgres error messages can include schema/column names, constraint identifiers, and partial row data — useful for an attacker mapping the data model.
- **Affected area:** Many `app/api/**/route.ts` files.
- **Likelihood / Impact / Risk:** Medium / Low / **Medium**.
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Cross-cutting (a small helper used everywhere).
- **Recommended fix:** Funnel all `NextResponse.json({ error, details })` through the existing `safeSupabaseError` helper (already used in some files), returning a generic message to the client and logging the full error server-side only.

### 12. Service-role client used for cron + public intake

- **Description:** `app/api/cron/pipeline-auto-close/route.ts:46`, `app/api/enquiries/route.ts:306`, and `lib/inbound-email/sync.ts:159, 331` all instantiate `createServiceClient()` (RLS bypass). Any code-injection, prototype-pollution, or auth-bypass bug on these routes immediately upgrades to a full-DB write/delete capability.
- **Affected area:** As above.
- **Likelihood / Impact / Risk:** Low / High / **Medium**.
- **Effort estimate:** Medium.
- **Cost implication:** Medium.
- **Scope of fix:** Cross-cutting.
- **Recommended fix:** Introduce dedicated Postgres roles (`enquiries_intake`, `email_sync`, `cron_runner`) with row-level INSERT/UPDATE grants on only the tables they need, and switch these routes to a JWT signed for those roles instead of the full service role.

### 13. `patchJobSchema` is `.passthrough()`

- **Description:** `app/api/jobs/[id]/route.ts:45–75` declares the patch schema and ends with `.passthrough()`, so unknown fields are not stripped. The handler ignores them today, but if any future Supabase update spreads `body` into `.update()`, an attacker could write to columns they should not (e.g. `consultant`, `stage`, audit fields).
- **Affected area:** `app/api/jobs/[id]/route.ts:75`.
- **Likelihood / Impact / Risk:** Low / Medium / **Medium**.
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Change `.passthrough()` to `.strict()` (or drop the modifier — Zod strips unknown keys by default) and explicitly add any legitimately extra fields.

### 14. Cron secret on GET with no rotation guidance

- **Description:** `app/api/cron/email-sync/route.ts:7` and `app/api/cron/pipeline-auto-close/route.ts:42` both accept `GET` with `Authorization: Bearer ${CRON_SECRET}`. The header (not the URL) carries the token, which is good. However, there is no rotation guidance, no per-invocation jitter, and nothing prevents the cron route from being replayed if the token leaks (e.g. via Vercel logs that include the Authorization header).
- **Affected area:** Cron routes + Vercel cron config in `vercel.json`.
- **Likelihood / Impact / Risk:** Low / Medium / **Medium**.
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Document `CRON_SECRET` rotation cadence (e.g. quarterly), or migrate to Vercel's signed cron headers (`x-vercel-signature`); switch to `POST` so URL/path is never confused with token.

### 15. Supabase local config permits unconfirmed self-signup

- **Description:** `supabase/config.toml:184` (`enable_signup = true`), `:201` (no captcha), `:217` (`[auth.email] enable_signup = true`), `:224` (`enable_confirmations = false`), and `:186` (`enable_anonymous_sign_ins = false` — good). The file is local-only, but the same defaults often leak into hosted projects. Anonymous self-signup would let an attacker obtain a valid JWT, which — combined with Finding 2 — grants full read of business data.
- **Affected area:** `supabase/config.toml`, hosted Supabase project settings.
- **Likelihood / Impact / Risk:** Low / Medium / **Low**.
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** In the hosted Supabase project, disable email/password signup (admin-only user creation is the model anyway). Mirror the same in `supabase/config.toml` — set `enable_signup = false` under `[auth]` and `[auth.email]`. Enable `[auth.captcha]` for `signin/forgot-password` flows.

### 16. Dev quick-login UI relies on build-time tree-shaking

- **Description:** `app/login/page.tsx:14–100` contains a "Quick login (dev only)" button gated by `process.env.NODE_ENV === "development"`. Next.js will tree-shake the conditional in production, but the default credentials list (`carmen@…`, `password123`, etc.) sits in the source and would be exposed under any misconfigured production deploy (e.g. `NODE_ENV` left as `development`).
- **Affected area:** `app/login/page.tsx:14–100`.
- **Likelihood / Impact / Risk:** Low / Medium / **Low**.
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Move the dev quick-login block behind a server-injected flag (`NEXT_PUBLIC_DEV_QUICK_LOGIN=1`) that is only set in `.env.local` and explicitly forbidden in Vercel production. Remove default seeded passwords from the bundle; require the operator to supply them via `localStorage`.

### 17. Operational notes contain seed credentials

- **Description:** `Browser test local app QA.md:6` documents `carmen@luxustravel.co.za / password123`, and `supabase/seed.sql:2` does the same for all five seeded staff. These are local-only, but the file is in the public repo and reveals the real domain (`luxustravel.co.za`) and the real staff names — which is good ammunition for phishing/credential-stuffing against the production tenant.
- **Affected area:** `Browser test local app QA.md`, `supabase/seed.sql`, `app/login/page.tsx:17–22`.
- **Likelihood / Impact / Risk:** Low / Low / **Low**.
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Replace real staff emails in seed/QA fixtures with `*@example.com` or `*@luxus.test`. Use the real domain only in the hosted production tenant.

---

## 4. Priority Actions

Address in this order (highest risk vs lowest effort first):

1. **Upgrade Next.js to `^16.2.6`** (Finding 1) and apply `pnpm.overrides` for `lodash` and `postcss` (Finding 5). Single `pnpm up` + audit re-run.
2. **Add Zod validation + CAPTCHA + IP rate limit to `/api/enquiries`** (Finding 3) — this is the only unauthenticated write surface and currently uses a service-role client.
3. **Rewrite RLS policies** so authenticated tenants can't `SELECT/UPDATE/DELETE` the entire database directly through Supabase (Finding 2). Mid-effort but foundational.
4. **Raise password minimum to 12, enable Supabase TOTP MFA for `admin`/`manager`, disable hosted email self-signup** (Findings 4, 15).
5. **Remove SVG from `voucher-assets` allowed mime types, and sanitise `bodyHtml` previews via DOMPurify or sandboxed iframe** (Findings 6, 7).
6. **Add baseline security headers in `next.config.mjs`** (Finding 9) — CSP report-only first, then enforce.
7. **Tighten `getSafeNextPath`** in the auth callback (Finding 8) and switch `patchJobSchema` to `.strict()` (Finding 13).
8. **Funnel all error responses through `safeSupabaseError`** so raw Postgres messages stop reaching the client (Finding 11), and harden `.or()` search filters (Finding 10).
9. Operational hygiene: rotate `CRON_SECRET`, replace seed emails with `example.com`, move dev quick-login behind a build-time flag (Findings 14, 17, 16). Consider per-route service-role replacements over time (Finding 12).

---

*Report generated by an automated security review. Re-run on the latest commit before relying on the findings.*
