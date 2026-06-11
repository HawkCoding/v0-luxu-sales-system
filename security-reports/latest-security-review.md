# Security Review — Luxus Sales System

| Field | Value |
| --- | --- |
| Repository | `hawkcoding/v0-luxu-sales-system` |
| Branch reviewed | `claude/friendly-curie-s7e1y0` |
| Run date | 2026-06-11 |
| Overall security posture | **Moderate** |
| Total findings | 12 |
| Highest-risk issue | **F1 — Public `/api/enquiries` POST uses service-role client without Zod validation or rate limiting** |
| Lowest-risk issue | **F12 — AES-GCM credential key derived via raw `sha256(secret)` with no salt/KDF** |

> Methodology: read-only static review of the current `claude/friendly-curie-s7e1y0` working tree (no execution, no live infrastructure probing). All findings are tied to concrete files in this repository. Likelihood/Impact ratings reflect a production SaaS deployment on Vercel + Supabase.

---

## 1. Summary

- **Total vulnerabilities found:** 12
- **Highest-risk issue:** Public `POST /api/enquiries` (`app/api/enquiries/route.ts`) uses the Supabase **service-role** client with effectively no validation, no authentication, no rate limiting, and writes directly to `customers`, `bookings`, `audit_logs`, etc. An unauthenticated attacker can inflate the customer/booking tables and burn through job-number sequences.
- **Lowest-risk issue:** `lib/inbound-email/crypto.ts` derives the AES-256-GCM key with a single SHA-256 of the env secret. Functionally fine when the secret is high entropy, but it is not a proper KDF and provides no rotation primitive.
- **Overall posture:** **Moderate**. The codebase consistently uses Supabase auth, Zod, role checks, audit logging and a service-role boundary — but the public intake route, the very wide RLS policies (`USING (true)` on most tables), the misnamed `proxy.ts` (Next.js requires `middleware.ts`) and the absence of security headers / rate limiting drag the posture down from Strong.

---

## 2. Risk Matrix

| # | Issue | Likelihood | Impact | Risk |
| --- | --- | --- | --- | --- |
| F1 | Public `/api/enquiries` POST uses service-role client, no Zod, no rate limit | High | High | **Critical** |
| F2 | RLS policies use `USING (true)` on core business tables (97 occurrences) | High | High | **Critical** |
| F3 | `proxy.ts` is not picked up as Next.js middleware (file must be `middleware.ts`) | Medium | High | **High** |
| F4 | Weak password policy: 6-character minimum for staff accounts & resets | Medium | High | **High** |
| F5 | Default dev quick-login emails + `password123` baked into client bundle | Medium | Medium | **Medium** |
| F6 | No HTTP security headers (CSP / HSTS / X-Frame-Options / X-Content-Type-Options / Referrer-Policy) | High | Medium | **High** |
| F7 | No rate limiting / brute-force protection on login, password reset, public intake | High | Medium | **High** |
| F8 | `auditListQuerySchema.search` only partially escapes PostgREST `.or()` filter characters | Medium | Low | **Medium** |
| F9 | `/api/dev/replay-inbound-email` is unauthenticated (only gated by `NODE_ENV !== "production"`) | Medium | Medium | **Medium** |
| F10 | Customer-import error responses include Supabase `code`/`hint`/`details` when `NODE_ENV !== "production"` | Medium | Low | **Low** |
| F11 | `app/api/logout/route.ts` uses non-null assertions on env vars (no fail-safe error) | Low | Low | **Low** |
| F12 | AES-GCM credential key = `sha256(env_secret)`; no salt/KDF, no rotation | Low | Medium | **Low** |

Severity ranking (most → least severe): **F1, F2, F3, F4, F6, F7, F5, F9, F8, F12, F10, F11**.

---

## 3. Detailed Findings

### F1 — Public `/api/enquiries` POST uses service-role client, no Zod validation, no rate limit

**Description.** `app/api/enquiries/route.ts:410` exposes a public, unauthenticated `POST` handler that calls `createServiceClient()` (`lib/supabase/server.ts:45`) and then writes to `customers`, `bookings`, `booking_suites`, `travellers`, `booking_transport_requests`, `booking_vehicle_rental_details`, `quotes`, `quote_line_items` and `audit_logs`. The handler never runs a Zod schema over `body`; it casts raw fields (`body.email`, `body.travellers`, `body.transportRequests`, `body.extractedJson`, `body.childAges`, …) through ad-hoc helpers like `normalizeNullableText` and `as Record<string, unknown>`. There is no rate limit, no CAPTCHA, no IP throttling, and no abuse logging.

Because the service-role client bypasses RLS, an unauthenticated attacker can:

- Spray arbitrary customer rows (and pollute `customers.email`, `phone`, `country`, `title`).
- Burn `booking_number_sequences` via `allocateJobNumberForBooking` (job-number enumeration / DoS).
- Inject arbitrary JSON into `bookings.extracted_json` (consumed elsewhere via casts like `(b.extracted_json as { historical_import?: { route?: string } } | null)` in the same file at `:387`).
- Cause unbounded writes (the array sizes `travellers`, `childTravellers`, `transportRequests` are unchecked).
- Trigger PII enrichment of *existing* customers (`resolveEnquiryCustomer` at `:742` overwrites first/last/phone/country/title on any match by email).

**Affected area.** `app/api/enquiries/route.ts:410-704` (POST handler, `resolveEnquiryCustomer`).

**Likelihood / Impact / Risk.** High / High / **Critical**.

**Effort estimate.** Medium.

**Cost implication.** Medium (Zod schema + rate-limit primitive).

**Scope of fix.** Cross-cutting (this route plus a shared rate-limit utility that other public endpoints can adopt).

**Recommended fix.**
1. Add a Zod schema that fully types `email`, `name`, `surname`, `travellers[]` (with `.max(20)` etc.), `childTravellers[]`, `transportRequests[]` and required string lengths. `safeParse` and return 400 on failure.
2. Cap collection sizes (`travellers.max(20)`, `transportRequests.max(10)`, `extractedJson` size).
3. Add a per-IP / per-email token-bucket rate limit (Upstash / Vercel KV / `@vercel/kv`) — e.g. 5 enquiries / IP / 10 min, 20 / IP / day.
4. Reject `extractedJson` from anonymous callers — only consultants pasting from the internal UI should supply it. Gate it behind a session check.
5. Tighten audit logging: include source IP and reCAPTCHA score.

---

### F2 — RLS policies use `USING (true)` on core business tables

**Description.** Across `supabase/migrations/*.sql` there are **97** occurrences of `USING (true)` / `WITH CHECK (true)` spread across 22 migrations, including the foundational `20260308095136_remote_schema.sql` which alone has 56. Examples:

```sql
CREATE POLICY "biz_delete" ON "public"."bookings" FOR DELETE TO "authenticated" USING (true);
CREATE POLICY "biz_delete" ON "public"."customers" FOR DELETE TO "authenticated" USING (true);
CREATE POLICY "al_insert" ON "public"."audit_logs" FOR INSERT TO "authenticated" WITH CHECK (true);
CREATE POLICY "al_select" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING (true);
```

Anyone with a valid JWT (i.e. any user from any role — readonly, consultant, manager, admin) can SELECT/INSERT/UPDATE/DELETE these tables directly via the anon-key browser client (`lib/supabase/client.ts:10`). Defence-in-depth is lost: server-side `requireRole(...)` checks in API routes are bypassed if a malicious frontend bypasses the API and talks to PostgREST directly with its session JWT. The Codex-style trust model in CLAUDE.md ("Prefer `createSessionClient()` (RLS-aware, user-scoped)") only works if RLS is meaningful — `USING (true)` makes it not meaningful.

**Affected area.** `supabase/migrations/*.sql` (22 files), every table with a `biz_*`/`ref_*`/`al_*` permissive policy.

**Likelihood / Impact / Risk.** High / High / **Critical**.

**Effort estimate.** High (need a per-table threat model).

**Cost implication.** Medium.

**Scope of fix.** Cross-cutting (touches the DB schema and downstream API expectations).

**Recommended fix.**
1. Replace `USING (true)` with policies keyed off `auth.uid()` and `auth_has_role(...)` (the helper at `supabase/migrations/20260523100000_sync_remote_rls_and_functions.sql:7` already exists).
2. For tables that legitimately need broad read (`routes`, `suppliers`, lookups), keep `USING (true)` only for SELECT — never for INSERT/UPDATE/DELETE.
3. For mutating policies, gate by role: `USING (auth_has_role(ARRAY['admin','manager']::user_role[]))`.
4. For ownership-bound rows (`bookings`, `quotes`, `quote_line_items`), restrict to `owner_user_id = auth.uid()` OR `auth_has_role(...)`.
5. Add a regression test that fails CI if any new migration introduces `USING (true)` for INSERT/UPDATE/DELETE.

---

### F3 — `proxy.ts` will not run as Next.js middleware

**Description.** The repo contains `proxy.ts` at the root (`proxy.ts:29` exports `proxy()` with `config.matcher`). Next.js auto-discovers middleware **only** when the file is named `middleware.ts` / `middleware.js` (or `src/middleware.*`). Nothing else imports `proxy.ts` (`grep` finds no callers). The session-refresh + `/login → /app` redirect for already-signed-in users is therefore dead code at runtime.

Consequences:
- Stale Supabase refresh tokens are never proactively rotated on navigation — sessions can silently expire.
- Signed-in users hitting `/login` are not redirected; the redirect happens only after client-side hydration.
- The Codex documentation ("Refresh expired Auth token — keeps user sessions alive") is no longer accurate.

This is not directly exploitable but degrades the auth lifecycle and would mask future fixes that *do* rely on middleware.

**Affected area.** `proxy.ts` (entire file), `next.config.mjs` (no middleware config).

**Likelihood / Impact / Risk.** Medium / High / **High**.

**Effort estimate.** Low (rename file).

**Cost implication.** Low.

**Scope of fix.** Localised.

**Recommended fix.** Rename `proxy.ts` → `middleware.ts` and export `middleware` (not `proxy`). Add a regression test that imports it. Confirm it runs in production with a smoke test against `/login` while already authenticated.

---

### F4 — Weak password policy (6-character minimum)

**Description.** Both staff-creation and password-reset endpoints enforce only `password.min(6)`:

- `app/api/users/route.ts:20` — `password: z.string().min(6, "Password must be at least 6 characters")`.
- `app/api/users/[userId]/password/route.ts:59` — `if (!newPassword || newPassword.length < 6)`.

6 characters is far below NIST SP 800-63B Rev.3 / OWASP ASVS L1 recommendations (≥ 8 with breach-list check). For a sales operations system holding customer PII, payment, and supplier credentials, this is too weak — particularly because the admin-set password is the steady-state credential (no MFA enforced in code).

**Affected area.** `app/api/users/route.ts:20`, `app/api/users/[userId]/password/route.ts:59`.

**Likelihood / Impact / Risk.** Medium / High / **High**.

**Effort estimate.** Low.

**Cost implication.** Low.

**Scope of fix.** Localised.

**Recommended fix.**
1. Raise minimum to 12 characters.
2. Reject the top-1000 common passwords (e.g. `zxcvbn` score ≥ 3, or `have-i-been-pwned` k-anonymity check).
3. Require MFA for `admin` / `manager` accounts (Supabase Auth MFA factor).
4. Apply the same rule in the consumer-facing password reset (`set-new-password` page in `app/auth/`).

---

### F5 — Default dev quick-login credentials in client bundle

**Description.** `app/login/page.tsx:16-23` hardcodes:

```ts
const defaultDevQuickLoginEmails = [
  "carmen@luxustravel.co.za", "dirk@luxustravel.co.za",
  "leonie@luxustravel.co.za", "monade@luxustravel.co.za",
  "douwlien@luxustravel.co.za",
]
const defaultDevQuickLoginPasswords = ["password123"]
```

The button is gated by `process.env.NODE_ENV === "development"`, but the constants are *module-level* and therefore ship in every build's JS bundle. An attacker reading the production bundle obtains a list of valid staff email addresses + the default seed password. If any of those accounts were ever provisioned with `password123` (the seed-demo flow uses it: `scripts/seed-demo.mjs`, `db:seed:demo` in `package.json`), credential stuffing is trivial.

**Affected area.** `app/login/page.tsx:16-23`, `scripts/seed-demo.mjs`.

**Likelihood / Impact / Risk.** Medium / Medium / **Medium**.

**Effort estimate.** Low.

**Cost implication.** Low.

**Scope of fix.** Localised.

**Recommended fix.**
1. Move the defaults into a dev-only module (`app/login/dev-quick-login.dev.ts`) that is dynamically imported behind `if (process.env.NODE_ENV === "development")` so tree-shaking removes it from prod builds, OR remove the defaults entirely and require `NEXT_PUBLIC_DEV_QUICK_LOGIN_*` env vars.
2. Force a password rotation on any user that still has the seed password `password123`. Add a DB check (`select user_id from auth.users where encrypted_password = crypt('password123', salt)` — pseudo-code) and an admin warning banner.

---

### F6 — Missing HTTP security headers

**Description.** Neither `next.config.mjs` nor `vercel.json` nor `proxy.ts` set any of: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. The app renders HTML email previews via `dangerouslySetInnerHTML` (`app/app/templates/page.tsx:178` area; `components/ui/chart.tsx`) — so a CSP would meaningfully reduce stored-XSS blast radius for any admin who pastes hostile HTML into a template.

**Affected area.** `next.config.mjs`, `vercel.json`.

**Likelihood / Impact / Risk.** High (default state) / Medium / **High**.

**Effort estimate.** Low.

**Cost implication.** Low.

**Scope of fix.** Localised.

**Recommended fix.** Add a `headers()` block in `next.config.mjs`:

```js
async headers() {
  return [{
    source: "/:path*",
    headers: [
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Content-Security-Policy", value: "default-src 'self'; img-src 'self' data: blob: https:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'; base-uri 'self';" },
    ],
  }]
}
```

Tune the CSP for Supabase, Vercel Analytics, and Resend's domains. Then sandbox the template-preview `dangerouslySetInnerHTML` inside an `<iframe sandbox>` so admin-supplied HTML cannot run scripts in the same origin.

---

### F7 — No rate limiting / brute-force protection

**Description.** No endpoint in `app/api/**` and no Next config implements rate limiting. The Supabase Auth client uses the default limits (per-project, not per-IP), so login, password-reset, customer import and `/api/enquiries` are all unprotected from credential stuffing, enumeration, and resource exhaustion. CLI search:

```
$ grep -rE "rate.?limit|throttle" app/api lib   →   no matches
```

**Affected area.** `app/api/**`, login flow.

**Likelihood / Impact / Risk.** High / Medium / **High**.

**Effort estimate.** Medium.

**Cost implication.** Medium (need Vercel KV / Upstash Redis).

**Scope of fix.** Cross-cutting.

**Recommended fix.** Add a small `lib/api/rate-limit.ts` using Upstash's `@upstash/ratelimit` (sliding window). Apply at minimum to:
- `POST /api/enquiries` (5 / IP / 10 min)
- `POST /api/customers/import` (10 / user / hour)
- All `/api/users/...` mutating endpoints (20 / admin / hour)
- All `/api/dev/*` endpoints (1 / IP / min)
- Login page Supabase calls (use Supabase Auth's existing IP rate limit + an additional per-email cooldown after 5 failures).

---

### F8 — Partial escaping in audit-log `search` filter

**Description.** `lib/audit.ts:252` builds a PostgREST `.or()` filter by string-interpolating user input after escaping only `,`, `%`, and `_`:

```ts
const escaped = params.search.replaceAll(",", " ").replaceAll("%", "\\%").replaceAll("_", "\\_")
query = query.or(
  `action.ilike.%${escaped}%,entity_type.ilike.%${escaped}%,entity_id.ilike.%${escaped}%,actor.ilike.%${escaped}%`,
)
```

PostgREST's `.or()` mini-grammar treats `)`, `(`, `*` and unescaped `,` as structural. A search like `a),action.eq.deleted` could let a manager re-shape the filter. RLS would still gate row access, but the *filter* (and counts/scope semantics) can be bypassed, leading to information disclosure within the role's permitted set or a confusing audit UI. Note the schema caps `search` at 160 chars (`auditListQuerySchema` at `:9`), so impact is limited.

**Affected area.** `lib/audit.ts:251-256`.

**Likelihood / Impact / Risk.** Medium / Low / **Medium**.

**Effort estimate.** Low.

**Cost implication.** Low.

**Scope of fix.** Localised.

**Recommended fix.** Either (a) reject any `search` containing `(`, `)`, `,`, `*`, `\`, or (b) issue four separate queries and `UNION` client-side. Option (a) preserves the single round-trip and is a one-line Zod refinement:

```ts
search: z.string().trim().max(160).regex(/^[^(),*\\]+$/).optional()
```

---

### F9 — `/api/dev/replay-inbound-email` unauthenticated outside production

**Description.** `app/api/dev/replay-inbound-email/route.ts:14` returns 404 only when `NODE_ENV === "production"`. In any preview / staging / Vercel-Preview deployment that does **not** export `NODE_ENV=production`, the route is wide open: an anonymous POST seeds a booking, runs `createEmailBookingFromParsedDraft` via service-role logic, and writes to `bookings`/`customers`/`audit_logs`. Vercel sets `NODE_ENV=production` for Preview by default, but a self-hosted or PR-preview deploy could miss this.

**Affected area.** `app/api/dev/replay-inbound-email/route.ts`.

**Likelihood / Impact / Risk.** Medium / Medium / **Medium**.

**Effort estimate.** Low.

**Cost implication.** Low.

**Scope of fix.** Localised.

**Recommended fix.** Replace the env check with an explicit `CRON_SECRET`/`DEV_TOOLS_SECRET` bearer check, like the cron routes (`app/api/cron/backup/route.ts:10`). Optionally also require `requireRole(["admin"])`.

---

### F10 — Verbose error responses outside production

**Description.** `app/api/customers/import/route.ts:79-89` returns a body containing `phase`, `traceId`, and full Supabase `details`/`code`/`hint`/`status` when `NODE_ENV !== "production"`. If a Vercel Preview ever exposes the import endpoint unauthenticated (it does not today, but combined with F2 RLS it would), an attacker could enumerate column names and constraints. Even today, signed-in low-privilege users see internal phase identifiers.

**Affected area.** `app/api/customers/import/route.ts:51-90`.

**Likelihood / Impact / Risk.** Medium / Low / **Low**.

**Effort estimate.** Low.

**Cost implication.** Low.

**Scope of fix.** Localised.

**Recommended fix.** Return only `{ error, traceId }` to clients in all environments. Log the full detail server-side (already done at `:69` via `console.error`). Surface server-only diagnostics in `logError(...)` rather than the response body.

---

### F11 — Non-null env-var assertions in `/api/logout`

**Description.** `app/api/logout/route.ts:10-11` does `process.env.NEXT_PUBLIC_SUPABASE_URL!` and `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!`. If either is missing at runtime, the call throws an uncaught TypeError instead of returning a clean 500 or aborting the session. Logout would fail silently from the user's perspective (session cookies still on the device).

**Affected area.** `app/api/logout/route.ts:10-11`.

**Likelihood / Impact / Risk.** Low / Low / **Low**.

**Effort estimate.** Low.

**Cost implication.** Low.

**Scope of fix.** Localised.

**Recommended fix.** Reuse `getPublicSupabaseEnv()` from `lib/supabase/server.ts:6`, or guard the values explicitly and return a 500 with a stable shape on misconfiguration.

---

### F12 — Credential key from raw `sha256(secret)`; no salt / KDF

**Description.** `lib/inbound-email/crypto.ts:13` builds the AES-256-GCM key as `createHash("sha256").update(secret).digest()`. The IV is correctly random per encryption and GCM provides AEAD, so confidentiality and integrity are intact when `EMAIL_CREDENTIAL_ENCRYPTION_KEY` is a 256-bit random secret. The concerns are:

- No KDF (PBKDF2 / scrypt / Argon2id) — if the env secret is a passphrase, brute force is feasible.
- No salt — every deployment that copies the secret gets the same key, so a backup leak from staging compromises production if the secret was reused.
- No key version / rotation primitive — the `"v1:"` prefix in the ciphertext suggests intent, but there is no way to migrate to `v2`.

**Affected area.** `lib/inbound-email/crypto.ts:6-14`.

**Likelihood / Impact / Risk.** Low / Medium / **Low**.

**Effort estimate.** Low.

**Cost implication.** Low.

**Scope of fix.** Localised.

**Recommended fix.**
1. Document that `EMAIL_CREDENTIAL_ENCRYPTION_KEY` must be ≥ 32 bytes of cryptographically random data (base64).
2. Either accept a base64 32-byte key directly, or run `scrypt(secret, salt, N=32768, r=8, p=1, dkLen=32)` with a per-deployment salt stored alongside the key.
3. Add a `key_version` column to `inbound_email_accounts.password_encrypted` storage so rotation can be staged.

---

## 4. Priority Actions

Ordered by **highest risk vs lowest effort** — start at the top.

1. **F3 (rename `proxy.ts` → `middleware.ts`)** — 1-line change, restores session refresh & login-redirect across the app.
2. **F1 (lock down `POST /api/enquiries`)** — add a Zod schema, cap collection sizes, gate `extractedJson` behind auth, and apply a per-IP rate limit. Same change can be reused for the customer import route.
3. **F6 (security headers)** — paste a `headers()` block into `next.config.mjs`; immediate XSS / clickjacking / mixed-content mitigation.
4. **F4 (raise password minimum to 12 chars + breach-list check)** — small change to two schemas, large risk reduction.
5. **F5 (move dev quick-login defaults out of the client bundle)** — eliminate the `password123` / staff email exposure.
6. **F2 (tighten `USING (true)` RLS policies)** — bigger lift; do it next sprint, focusing first on `bookings`, `customers`, `quotes`, `payments`, `audit_logs`, `salesperson_credentials`.
7. **F7 (rate limiting)** — bundle with F1; ship a shared `lib/api/rate-limit.ts`.
8. **F9 (gate `/api/dev/replay-inbound-email` behind a bearer secret)**.
9. **F8 (regex-restrict `audit` search filter)**.
10. **F10–F12** — opportunistic hardening; do during normal maintenance.

---

### Appendix — Coverage notes

- Routes reviewed: 84 files matching `app/api/**/route.ts` (sampled in depth: enquiries, cron, users, audit, voucher/generate, backups/restore, customers/import, dev/replay-inbound-email, logout, packages, suppliers, locations, inbound-email/accounts).
- Dependencies inspected (`pnpm-lock.yaml`): `next@16.1.6`, `react@19.2.4`, `@supabase/ssr@0.8.0`, `@supabase/supabase-js@2.98.0`, `zod@3.25.76`, `swr@2.4.0`, `react-hook-form@7.71.1`, `imapflow@1.3.2`, `mailparser@3.9.8`, `nodemailer@8.0.7`, `resend@6.9.3`, `@react-pdf/renderer@4.5.1`. None of these versions match a currently advisory-listed vulnerable range as of the run date. Notably, `next@16.1.6` ships post-CVE-2025-29927 (middleware-bypass) fixes — and because this repo's `proxy.ts` is not loaded as middleware (F3), the bypass is moot here.
- Migration RLS quick stat: 97 `USING (true)` / `WITH CHECK (true)` policies across 22 migration files (`grep -c` counts retained for transparency in F2).
- No secrets, `.env` files, or API keys were found checked in. `.gitignore` (`/.gitignore:10`, `:33-35`) covers `.env*.local`, `.mcp.json`, `.claude/settings.local.json`.
