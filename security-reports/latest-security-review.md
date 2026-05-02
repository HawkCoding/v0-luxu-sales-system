# Security Review — Luxus Sales System

| Field | Value |
|---|---|
| Repository | `hawkcoding/v0-luxu-sales-system` |
| Run date | 2026-05-02 |
| Branch reviewed | `claude/friendly-curie-mAwhd` |
| Total findings | 19 |
| Highest-risk issue | RLS allows users to escalate their own `clearance_level` to `admin` |
| Lowest-risk issue | Weak `SUPABASE_SERVICE_ROLE_KEY` shape check |
| Overall security posture | **Poor** |

---

## 1. Summary

- **19 findings** across application, dependency, configuration and data‑handling layers.
- **Highest-risk issue:** *Self-update on `profiles` lets any authenticated user grant themselves admin role* — the `profiles_update_own` RLS policy permits column-level updates with no restriction on `clearance_level`. A malicious staff user can call the JS Supabase client directly and become admin.
- **Lowest-risk issue:** *`SUPABASE_SERVICE_ROLE_KEY` validity check uses `.includes(".")`* — only confirms the string contains a dot; informational hardening only.
- Several public/internal write endpoints (`/api/correspondence`, `/api/payments` POST, `/api/templates` PATCH, `/api/jobs/[id]` PATCH, `/api/pipeline`, `/api/enquiries`) skip an explicit `auth.getUser()` check and rely solely on permissive RLS — most of which is `USING (true)` for any authenticated role, including `readonly`.
- Next.js `16.1.6` is exposed to **6 published advisories** (1 high, 4 moderate, 1 low) including a Server-Components DoS and a Server-Actions CSRF bypass; upgrade to `>= 16.2.3`.
- No security headers, no rate limiting on the public `/api/enquiries` intake route, weak password floor (6 chars), and stored HTML rendered with `dangerouslySetInnerHTML` in `app/app/templates/page.tsx`.

---

## 2. Risk Matrix

| # | Issue | Likelihood | Impact | Risk Level |
|---|---|---|---|---|
| 1 | RLS privilege escalation via `profiles_update_own` | High | High | **Critical** |
| 2 | Public `/api/enquiries` uses service-role client with no Zod, rate-limit, or terms gate | High | High | **High** |
| 3 | Next.js 16.1.6 — 6 known CVEs (incl. high-severity Server Components DoS) | High | High | **High** |
| 4 | Permissive blanket RLS (`biz_*` policies = `USING (true)`) for all authenticated users | High | High | **High** |
| 5 | `/api/templates` PATCH unauthenticated; arbitrary `body_html` stored and rendered via `dangerouslySetInnerHTML` | Medium | High | **High** |
| 6 | `/api/jobs/[id]` PATCH performs no auth/authz; stage/cancel mutations open to any caller subject only to RLS | Medium | High | **High** |
| 7 | `/api/correspondence` POST unauthenticated; can write rows + change booking stage | Medium | Medium | **Medium** |
| 8 | `/api/payments` POST unauthenticated; can insert arbitrary payments | Medium | High | **High** |
| 9 | Open redirect in `/auth/callback` — `getSafeNextPath` accepts protocol-relative `//evil.com` | Medium | Medium | **Medium** |
| 10 | `/api/audit` POST allows any authenticated user to forge audit entries | High | Medium | **Medium** |
| 11 | No rate limiting on public intake (`/api/enquiries`) and login endpoints | High | Medium | **Medium** |
| 12 | Weak password minimum (6 chars) for admin-set passwords | Medium | Medium | **Medium** |
| 13 | No HTTP security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy) | High | Low | **Medium** |
| 14 | `raw_text` / `extracted_json` from public form unbounded — storage exhaustion vector | Medium | Medium | **Medium** |
| 15 | Verbose Supabase error leakage (`/api/users` GET, `/api/templates` PATCH, `/api/customers/import` always exposes `details` outside production-only guard incompletely) | Medium | Low | **Low** |
| 16 | Use of `any[]` casts in `/api/enquiries` traveller mapping — bypasses type safety | Low | Low | **Low** |
| 17 | Mock-only `Math.random() > 0.1` "send success" gate in `/api/correspondence` writes randomized real DB state | Medium | Low | **Low** |
| 18 | Transitive dev-dep CVEs (lodash, picomatch, brace-expansion, vite, postcss, uuid) | Low | Low | **Low** |
| 19 | `SUPABASE_SERVICE_ROLE_KEY.includes(".")` is a weak shape check | Low | Low | **Low** |

---

## 3. Detailed Findings

### 1. RLS allows users to escalate their own role to `admin` *(Critical)*

- **Description:** The `profiles_update_own` RLS policy is `USING ((user_id = auth.uid()) OR auth_has_role(['admin'])) WITH CHECK (...)` with no column-level restriction and no `BEFORE UPDATE` trigger preventing `clearance_level` writes by self. Any authenticated user can call `supabase.from('profiles').update({ clearance_level: 'admin' }).eq('user_id', auth.uid())` from the browser using the anon key and become admin. The only `BEFORE UPDATE` trigger on the table is `set_updated_at`.
- **Affected area:** `supabase/migrations/20260308095136_remote_schema.sql:profiles_update_own` (re-applied in `20260308103214_remote_schema.sql`).
- **Likelihood / Impact / Risk:** High / High / **Critical**
- **Effort:** Medium (DB migration + redeploy types).
- **Cost:** Low–Medium.
- **Scope of fix:** Localised (single policy + new trigger).
- **Recommended fix:**
  1. Replace `profiles_update_own` with a policy that only allows non-privileged columns (e.g. `name`, `surname`) when `user_id = auth.uid()` and *not* `admin`, by either splitting into two policies (admin-update full, self-update restricted) or by adding a `BEFORE UPDATE` trigger that blocks writes to `clearance_level`/`is_active`/`email` when `auth.uid() = user_id` and the actor is not an admin.
  2. Verify with a regression test using a non-admin Supabase JWT.

### 2. Public `/api/enquiries` POST uses service-role client with no validation, rate-limit, or terms gate *(High)*

- **Description:** The endpoint accepts arbitrary JSON, calls `createServiceClient()` (bypassing all RLS), reads `body.email`, `body.travellers as any[]`, etc., and inserts into `customers`, `bookings`, `booking_suites`, `travellers`, and `audit_logs`. There is no Zod schema, no authentication, no CAPTCHA / rate limit, no `terms_accepted` enforcement, and child‑traveller PII (DOB, ID/passport) is accepted unvalidated. The route also writes audit logs with attacker-supplied actors (`"consultant"` / `"system"`).
- **Affected area:** `app/api/enquiries/route.ts:59-259`.
- **Likelihood / Impact / Risk:** High / High / **High**
- **Effort:** Medium.
- **Cost:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:**
  - Add a Zod schema covering every accepted field with strict length caps (especially `rawText`, `extractedJson`, child-travellers).
  - Add edge / Vercel rate limiting (IP + email) — e.g. `@upstash/ratelimit` or Vercel WAF rules.
  - Add a CAPTCHA (hCaptcha / Turnstile) for the public form path (`source = 'web_form'`).
  - Reject when `termsAccepted !== true`.
  - Move `paste_import` source behind authenticated session client and drop the service-role usage on the web-form path (an RLS policy that allows anon-insert into a single `enquiries_inbox` staging table is safer than a service-role bypass).

### 3. Next.js 16.1.6 — 6 known CVEs *(High)*

- **Description:** `pnpm audit` reports against `next@16.1.6`:
  - **High** GHSA-…-2026-… "Denial of Service with Server Components" (fixed `>=16.2.3`).
  - **Moderate** CVE-2026-29057 — HTTP request smuggling in rewrites.
  - **Moderate** CVE-2026-27978 — `null` Origin bypass of Server-Actions CSRF.
  - **Moderate** CVE-2026-27979 — Unbounded postponed-resume buffering DoS.
  - **Moderate** CVE-2026-27980 — Unbounded `next/image` disk cache.
  - **Low** CVE-2026-27977 — `null` Origin bypass of dev HMR CSRF.
- **Affected area:** `package.json:71` (`next: 16.1.6`).
- **Likelihood / Impact / Risk:** High / High / **High** (Vercel-hosted mitigates several but not the Server-Components DoS or CSRF-bypass).
- **Effort:** Low (pin bump).
- **Cost:** Low.
- **Scope of fix:** Localised; verify build + tests.
- **Recommended fix:** `pnpm add next@^16.2.3` (or latest `16.x`), re-run `pnpm install`, run `pnpm test:ci`, and confirm `proxy.ts` middleware still runs.

### 4. Permissive blanket RLS (`biz_*` = `USING (true)`) *(High)*

- **Description:** Every business table (`bookings`, `customers`, `payments`, `quotes`, `quote_line_items`, `travellers`, `booking_suites`, `correspondences`, `documents`, `itineraries`) has `biz_select/insert/update/delete` policies of `USING (true) WITH CHECK (true)` granted to the `authenticated` role. This means any logged-in user, including `readonly`, can **read every customer's PII, write payments, change quote totals, delete vouchers**, etc. Server routes are the only enforcement — and several skip role checks entirely.
- **Affected area:** `supabase/migrations/20260308095136_remote_schema.sql` (`biz_*` policies).
- **Likelihood / Impact / Risk:** High / High / **High**
- **Effort:** High — requires reshaping policies per table by `owner_user_id`, role, or stage.
- **Cost:** Medium.
- **Scope of fix:** Cross-cutting (DB policies + server route assumptions).
- **Recommended fix:** Replace blanket `true` policies with policies that require role ≥ `consultant` for most ops, restrict `payments`/`quotes` writes to the booking owner or roles `admin`/`manager`, and forbid `readonly` writes everywhere.

### 5. `/api/templates` PATCH unauthenticated → stored HTML rendered via `dangerouslySetInnerHTML` *(High)*

- **Description:** `app/api/templates/route.ts:24-67` does not call `supabase.auth.getUser()` and does not check role. Body is unvalidated, `body.bodyHtml` is stored directly. The template preview renders that HTML with `dangerouslySetInnerHTML` (`app/app/templates/page.tsx`), giving stored XSS / phishing pretext if RLS is misconfigured or if a low-privilege session reaches this route. Audit log is forged with `actor: "admin"`.
- **Affected area:** `app/api/templates/route.ts`, `app/app/templates/page.tsx`.
- **Likelihood / Impact / Risk:** Medium / High / **High**
- **Effort:** Low.
- **Cost:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Add `requireAdmin()` (or admin/manager) auth + Zod validation; sanitize stored HTML with `DOMPurify` (server-side) before write; record real actor from session.

### 6. `/api/jobs/[id]` PATCH performs no auth/authz check *(High)*

- **Description:** `app/api/jobs/[id]/route.ts:229-318` calls `getUser()` only to look up an actor name; it does **not** return 401 on missing user, does not enforce role, and writes `pipeline_history`, `audit_logs`, and the booking row with attacker-controlled `body.stage` cast `as PipelineStage` (no enum validation).
- **Affected area:** `app/api/jobs/[id]/route.ts:229-318`.
- **Likelihood / Impact / Risk:** Medium / High / **High**
- **Effort:** Low.
- **Cost:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Add explicit 401 on missing user, validate body with Zod (whitelist stage enum), and gate cancel/move-to-`closed` actions behind `admin`/`manager`.

### 7. `/api/correspondence` POST unauthenticated *(Medium)*

- **Description:** `app/api/correspondence/route.ts` accepts arbitrary `bookingId`/`bodyHtml`/`subject`/`actor`, writes to `correspondences`, can move booking stage and write audit logs with attacker-controlled actor. Also includes a `Math.random() > 0.1` mock branch in production code path.
- **Affected area:** `app/api/correspondence/route.ts`.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**
- **Effort:** Low.
- **Cost:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Require auth + role, Zod validation, sanitize `bodyHtml`, remove the random success simulator before shipping to production.

### 8. `/api/payments` POST unauthenticated *(High)*

- **Description:** `app/api/payments/route.ts` writes to `payments` and `audit_logs` using only `createSessionClient()`; no auth check is done; `body.amount` and `body.method` are forwarded raw. A malicious request could insert negative or massive amounts (which would then change deposit/balance logic), or forge audit history with a chosen `actor`.
- **Affected area:** `app/api/payments/route.ts`.
- **Likelihood / Impact / Risk:** Medium / High / **High**
- **Effort:** Low.
- **Cost:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Require auth + `admin`/`manager`, Zod-validate `amount` (`number().positive().max(...)`), `method` (enum), and lock `actor` to the session profile.

### 9. Open redirect via `next` query param in `/auth/callback` *(Medium)*

- **Description:** `app/auth/callback/route.ts:4-7`'s `getSafeNextPath` only checks `startsWith("/")`. Values like `//evil.com/path` or `/\evil.com` start with `/` but Next.js `NextResponse.redirect` issues a Location header that browsers resolve as cross-origin.
- **Affected area:** `app/auth/callback/route.ts:4-7`, used at line 12.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**
- **Effort:** Low.
- **Cost:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Reject any `next` that doesn't match `/^\/[A-Za-z0-9_\-/]+$/` or reject when it starts with `//` or `/\\`.

### 10. `/api/audit` POST lets any authenticated user forge audit entries *(Medium)*

- **Description:** `app/api/audit/route.ts:48-118` only requires authentication, then writes any caller-supplied `entityType`/`entityId`/`action` into `audit_logs`. Combined with the permissive `al_insert` RLS, a `readonly` user can pollute or imitate sensitive audit events such as `password_reset` or `role_changed`.
- **Affected area:** `app/api/audit/route.ts`.
- **Likelihood / Impact / Risk:** High / Medium / **Medium**
- **Effort:** Low.
- **Cost:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Restrict `POST /api/audit` to `admin`/`manager` and/or constrain `entity_type`/`action` to a whitelist; never accept caller-provided `actor` (already partially done).

### 11. No rate limiting on intake / login *(Medium)*

- **Description:** `/api/enquiries`, `/api/customers/import`, `/login`, and password reset endpoints have no IP- or user-based throttling. Permits credential stuffing, enumeration, and DB stuffing.
- **Affected area:** Whole `app/api/**`.
- **Likelihood / Impact / Risk:** High / Medium / **Medium**
- **Effort:** Medium.
- **Cost:** Low–Medium.
- **Scope of fix:** Cross-cutting.
- **Recommended fix:** Vercel WAF rate-limit rules or `@upstash/ratelimit` middleware on public/intake routes; lockout-style backoff on repeated failed logins.

### 12. Weak password minimum (6 chars) *(Medium)*

- **Description:** `app/api/users/route.ts:20` and `app/api/users/[userId]/password/route.ts:58` enforce only `min(6)`. Modern guidance (NIST 800-63B) is ≥ 8 chars, ideally with a banned-password check.
- **Affected area:** Auth-adjacent admin routes.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**
- **Effort:** Low.
- **Cost:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Bump to `min(12)` (or `min(8)` plus length+entropy hint) and integrate a breach-list check (`have-i-been-pwned` k-anonymity API) before set.

### 13. No security headers configured *(Medium)*

- **Description:** Neither `next.config.mjs` nor `vercel.json` sets CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, or `Permissions-Policy`.
- **Affected area:** `next.config.mjs`, `vercel.json`.
- **Likelihood / Impact / Risk:** High / Low / **Medium**
- **Effort:** Low.
- **Cost:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Add a `headers()` block in `next.config.mjs` with at minimum `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and a starter CSP that allows Supabase + Vercel domains.

### 14. Unbounded `raw_text` / `extracted_json` from public form *(Medium)*

- **Description:** Public `/api/enquiries` writes `raw_text` and `extracted_json` directly into Postgres with no length limit. An attacker can submit megabytes per request, causing storage exhaustion or query-plan blow-up later.
- **Affected area:** `app/api/enquiries/route.ts:172`.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**
- **Effort:** Low.
- **Cost:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Cap `raw_text` length (e.g. 32 KB) via Zod and `CHECK (length(raw_text) < 32768)` constraint.

### 15. Verbose Supabase error leakage *(Low)*

- **Description:** `/api/users` GET returns `withIsActiveError.message || legacyError.message` directly; `/api/templates` PATCH returns Supabase `error.message`; `/api/customers/import` exposes `details` to clients in non-prod (acceptable) but the same diagnostics path shows the original DB `code`/`hint` if `NODE_ENV` is set to `development` accidentally on Vercel preview.
- **Affected area:** Multiple `app/api/**/route.ts`.
- **Likelihood / Impact / Risk:** Medium / Low / **Low**
- **Effort:** Low.
- **Cost:** Low.
- **Scope of fix:** Cross-cutting (small wrapper).
- **Recommended fix:** Map all Supabase errors through a `toClientError()` helper that returns a generic message in non-development environments and logs the detail server-side.

### 16. `any[]` casts on traveller mapping in `/api/enquiries` *(Low)*

- **Description:** `body.travellers` and `body.childTravellers` are typed `any[]` and field accesses are unchecked. Given the public origin, this widens the impact of any logic bug.
- **Affected area:** `app/api/enquiries/route.ts:211-237`.
- **Likelihood / Impact / Risk:** Low / Low / **Low**
- **Effort:** Low.
- **Cost:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Replace `any` with the same Zod schema introduced in finding #2.

### 17. Mock random success branch in `/api/correspondence` *(Low)*

- **Description:** `Math.random() > 0.1` randomly marks a correspondence as `failed` and skips the stage move and follow-up scheduling. This randomized DB state is non-deterministic and makes audit timelines untrustworthy.
- **Affected area:** `app/api/correspondence/route.ts:12`.
- **Likelihood / Impact / Risk:** Medium / Low / **Low**
- **Effort:** Low.
- **Cost:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Remove the mock or gate it behind `process.env.NODE_ENV !== "production"`.

### 18. Transitive dev-dep CVEs (lodash, picomatch, brace-expansion, vite, postcss, uuid) *(Low)*

- **Description:** `pnpm audit` lists 10 additional advisories on transitive dependencies, all reachable only through dev tooling (vitest, postcss, etc.). None reach production runtime today, but they raise build-machine risk and should be tracked.
- **Affected area:** `pnpm-lock.yaml` (transitive of `vitest@4`, `tailwindcss@4`, etc.).
- **Likelihood / Impact / Risk:** Low / Low / **Low**
- **Effort:** Medium (some upstream bumps required).
- **Cost:** Low.
- **Scope of fix:** Cross-cutting (lockfile).
- **Recommended fix:** Run `pnpm update --interactive --recursive` for the affected packages; pin `picomatch >= 4.0.4`, `brace-expansion >= 1.1.13`, `vite >= 7.3.2`, `postcss >= 8.5.10`, `uuid >= 14.0.0` via overrides if needed.

### 19. Weak `SUPABASE_SERVICE_ROLE_KEY` shape check *(Low)*

- **Description:** `lib/supabase/server.ts:54` only checks `serviceKey.includes(".")`. A malformed/leaked-but-truncated JWT could pass.
- **Affected area:** `lib/supabase/server.ts:54`.
- **Likelihood / Impact / Risk:** Low / Low / **Low**
- **Effort:** Low.
- **Cost:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Decode the JWT header/payload and verify `role === "service_role"` and `iss` matches the project URL; fail closed otherwise.

---

## 4. Priority Actions

Top issues to address first, ordered by *risk × inverse-effort*:

1. **Patch RLS privilege escalation (Finding #1)** — single migration; closes a critical attack path.
2. **Bump Next.js to `>= 16.2.3` (Finding #3)** — one dependency bump removes 6 advisories.
3. **Lock down write API routes that lack auth** (Findings #5, #6, #7, #8) — small consistent edit (`requireAuthenticatedUser` + Zod) per route.
4. **Harden `/api/enquiries` and add rate limiting (Findings #2, #11, #14)** — single most attractive surface for abuse.
5. **Replace blanket `biz_*` RLS with role-aware policies (Finding #4)** — larger but caps blast radius if a route ever leaks again.
6. **Fix open redirect in `/auth/callback` (Finding #9)** — one-line guard.
7. **Add HTTP security headers (Finding #13)** — single `headers()` block in `next.config.mjs`.
8. **Restrict `/api/audit` writes (Finding #10)** — quick role gate.
9. **Raise password floor (Finding #12)** and tidy verbose errors (Finding #15) for hygiene.
10. **Track transitive dev-dep CVEs and clean up `any[]` / mock branches (Findings #16-19)** at next dependency-maintenance window.
