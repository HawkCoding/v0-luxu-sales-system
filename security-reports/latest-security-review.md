# Security Review — Luxus Sales System

| Field                | Value                                                            |
| -------------------- | ---------------------------------------------------------------- |
| Repository           | `HawkCoding/v0-luxu-sales-system`                                |
| Run date             | 2026-05-05                                                       |
| Branch reviewed      | `claude/friendly-curie-Er75i`                                    |
| Overall posture      | **Poor → Moderate** (multiple High-risk issues, several quick wins) |
| Highest-risk issue   | F2 — Public `/api/enquiries` writes via service-role with no validation, rate limiting, or abuse controls |
| Lowest-risk issue    | F12 — Non-constant-time comparison of `CRON_SECRET` bearer token |
| Total findings       | 13                                                               |

---

## 1. Summary

- 13 findings across application logic, RLS/authorization, dependencies, and headers.
- **Highest-risk**: `app/api/enquiries/route.ts` is a public, unauthenticated endpoint that uses `createServiceClient()` (bypasses RLS) and accepts un-validated JSON to upsert customers, bookings, suites, travellers and transport requests. Any internet user can overwrite an existing customer's name / phone / country / title just by knowing their email, and can inject unbounded booking rows.
- **Lowest-risk**: cron route bearer-token check uses `!==` rather than `crypto.timingSafeEqual`. Timing attacks on a short-lived bearer secret are largely theoretical, but the constant-time fix is trivial.
- Posture is **Poor** today because of (a) two open Next.js CVEs, (b) blanket `USING (true)` RLS policies that turn any authenticated session into full read/write of all PII and financial data, and (c) the public service-role intake. With those three classes of issues fixed the posture moves to **Moderate**.

---

## 2. Risk Matrix

| #   | Issue                                                                   | Likelihood | Impact | Risk     |
| --- | ----------------------------------------------------------------------- | ---------- | ------ | -------- |
| F1  | Next.js 16.1.6 — CVE-2026-27978 (CSRF) and CVE-2026-27980 (disk DoS)    | High       | High   | **High** |
| F2  | Public `/api/enquiries` uses service-role + no Zod / rate limit         | High       | High   | **High** |
| F3  | RLS is `USING (true) WITH CHECK (true)` for all `authenticated`         | High       | High   | **High** |
| F4  | `/api/correspondence` POST: no auth, no Zod, client-controlled `actor` and `moveStage`, raw HTML stored | Medium     | High   | **High** |
| F5  | Stored XSS via `templates.body_html` rendered with `dangerouslySetInnerHTML` | Medium     | High   | **High** |
| F6  | `/api/data` GET unauthenticated (only audit logs gated)                 | Medium     | High   | **High** |
| F7  | Weak password policy (min 6 chars) for create/reset user                | Medium     | Medium | Medium   |
| F8  | `patchJobSchema.passthrough()` accepts unknown fields                   | Low        | Medium | Medium   |
| F9  | PostgREST `.or()` operator injection in `/api/customers` search         | Medium     | Medium | Medium   |
| F10 | `/api/templates` PATCH lacks auth + role gate; spoofs audit actor       | Medium     | Medium | Medium   |
| F11 | `/api/payments` POST lacks auth check, Zod, and accepts client `actor`  | Medium     | Medium | Medium   |
| F12 | Cron secret comparison is non-constant-time                             | Low        | Low    | Low      |
| F13 | `proxy.ts` is not wired as Next.js middleware (auth refresh dead code)  | Medium     | Low    | Low      |

---

## 3. Detailed Findings

### F1 — Next.js 16.1.6 has open high-severity CVEs

- **Description**: `package.json` pins `next: 16.1.6` and `pnpm-lock.yaml` resolves the same. CVE-2026-27978 (CSRF: `Origin: null` not treated as cross-origin) and CVE-2026-27980 (image-optimization disk-space DoS) are fixed in 16.1.7.
- **Affected area**: `package.json:82`, all server/client routes; `/api/*` are reachable for the CSRF case.
- **Likelihood / Impact / Risk**: High / High / **High**
- **Effort**: Low (`pnpm add next@^16.1.7` and rerun build/tests)
- **Cost**: Low
- **Scope**: Localised (single dep upgrade)
- **Recommended fix**: Upgrade to `next@^16.1.7` (or latest 16.x), run `pnpm install --frozen-lockfile=false` to refresh the lockfile, redeploy.

### F2 — Public service-role intake at `/api/enquiries`

- **Description**: `app/api/enquiries/route.ts:88-318` accepts JSON from any unauthenticated caller, instantiates `createServiceClient()` (RLS bypass), and: (1) looks up customers by email; (2) **updates** existing customers' `first_name`, `last_name`, `phone`, `country`, `title` based purely on the request body; (3) inserts unlimited `bookings`, `booking_suites`, `travellers`, `booking_transport_requests`. There is no Zod schema, no `req.json()` size limit, no CAPTCHA, no rate limiting, and no honeypot.
- **Affected area**: `app/api/enquiries/route.ts` (entire file); writes to `customers`, `bookings`, `booking_suites`, `travellers`, `booking_transport_requests`, `audit_logs`.
- **Likelihood / Impact / Risk**: High / High / **High** — Internet-facing data integrity / spam / mass-pollution vector. An attacker who scrapes a single customer email can overwrite their phone or country, or flood the pipeline with junk bookings that staff must triage.
- **Effort**: Medium
- **Cost**: Low–Medium
- **Scope**: Localised, but interacts with several tables.
- **Recommended fix**:
  1. Add a strict Zod schema (typed adults/children/transport arrays with bounded length).
  2. **Do not update existing customers from this endpoint** — only create when no row matches, or write the diff into a `pending_review` table for staff approval.
  3. Add per-IP rate limiting (Vercel Edge Config / Upstash) and either Turnstile/hCaptcha or signed nonce from the public form.
  4. Cap `req.json()` size (Next.js `maxDuration` + body size guard) and limit array lengths (`travellers`, `transportRequests`).
  5. Log the source IP and user agent into `audit_logs.meta_json`.

### F3 — Permissive RLS policies (`USING (true)`)

- **Description**: `supabase/migrations/20260308095136_remote_schema.sql` creates `biz_select / biz_insert / biz_update / biz_delete` policies on `bookings`, `customers`, `payments`, `quotes`, `quote_line_items`, `correspondences`, `documents`, `itineraries`, `travellers`, `booking_suites`, and `audit_logs` — all with `USING (true)` / `WITH CHECK (true)` for the `authenticated` role. Any authenticated user (including `readonly` and `consultant`) can read, update, and delete every customer's PII and every payment record from the browser via the anon key + their JWT.
- **Affected area**: All core domain tables (`supabase/migrations/20260308095136_remote_schema.sql`).
- **Likelihood / Impact / Risk**: High / High / **High** — full PII / financial exfiltration by any compromised staff session; insider risk; lateral elevation when readonly role is given out widely.
- **Effort**: High (re-design RLS by role using `auth.jwt() ->> 'clearance_level'` with a custom JWT hook — partially in place at `20260429160000_add_clearance_level_jwt_hook.sql`).
- **Cost**: Medium
- **Scope**: Cross-cutting (every protected table).
- **Recommended fix**: Replace `USING (true)` with role-aware predicates. Example for `payments`:
  ```sql
  CREATE POLICY "payments_select" ON public.payments FOR SELECT
    TO authenticated
    USING (auth.jwt() ->> 'clearance_level' IN ('admin','manager','consultant','readonly'));
  CREATE POLICY "payments_modify" ON public.payments FOR ALL
    TO authenticated
    USING (auth.jwt() ->> 'clearance_level' IN ('admin','manager','consultant'))
    WITH CHECK (auth.jwt() ->> 'clearance_level' IN ('admin','manager','consultant'));
  ```
  Tighten further by ownership where applicable (e.g. `consultant_user_id = auth.uid()` for non-managers). Re-run policy tests against each role.

### F4 — `/api/correspondence` POST: missing controls + raw HTML

- **Description**: `app/api/correspondence/route.ts:5-80` does not call `supabase.auth.getUser()`, has no Zod schema, accepts a client-supplied `actor` written to `audit_logs`, and uses client-supplied `moveStage` to mutate the booking pipeline. The `bodyHtml` is stored verbatim and later rendered with `dangerouslySetInnerHTML` (see F5). The `Math.random() > 0.1` "send success" branch suggests this route is mock plumbing that nevertheless writes production rows.
- **Affected area**: `app/api/correspondence/route.ts`
- **Likelihood / Impact / Risk**: Medium / High / **High** (relies on RLS for any auth, which per F3 is permissive)
- **Effort**: Low
- **Cost**: Low
- **Scope**: Localised
- **Recommended fix**:
  1. Add `createSessionClient()` + `supabase.auth.getUser()` and 401 on missing user.
  2. Replace body parsing with Zod (`bookingId UUID`, `subject string ≤200`, `bodyHtml string ≤50k`, `channel enum`, `moveStage enum`).
  3. Derive `actor` from the authenticated profile, never from the request.
  4. Sanitize `body_html` with a server-side sanitizer (e.g. `sanitize-html`) before insert; reject inline `<script>`/event handlers.
  5. Remove the random simulation; either make it a real send or split this into a separate `/api/correspondence/test` dev-only route.

### F5 — Stored XSS via `templates.body_html`

- **Description**: `app/app/templates/page.tsx:232` renders `preview?.bodyHtml` with `dangerouslySetInnerHTML` and no sanitization. `PATCH /api/templates` (`app/api/templates/route.ts:24-67`) accepts `bodyHtml` from any authenticated session, with no role check and no sanitization, while writing `actor: "admin"` to the audit log regardless of the real caller. A non-admin user can plant `<script>` and pop another staff member's session.
- **Affected area**: `app/api/templates/route.ts`, `app/app/templates/page.tsx`
- **Likelihood / Impact / Risk**: Medium / High / **High**
- **Effort**: Low
- **Cost**: Low
- **Scope**: Localised
- **Recommended fix**:
  1. Gate template writes behind `clearance_level === 'admin'` (mirroring `requireAdminSettingsAccess`).
  2. Sanitize on write with a server-side allowlist (`sanitize-html`) — strip `<script>`, `javascript:`, `on*` handlers.
  3. Set `actor` to the authenticated profile name, not a string literal.
  4. Render previews inside a sandboxed `<iframe srcDoc>` with `sandbox="allow-same-origin"` removed, instead of `dangerouslySetInnerHTML`.

### F6 — `/api/data` GET is unauthenticated

- **Description**: `app/api/data/route.ts:13-25` calls `getUser()` only to decide if it can include `audit_logs`; it does not 401 when the request is unauthenticated. RLS is the only layer protecting the entire CRM dump (customers, bookings, payments, quotes, correspondences, etc.). Combined with F3, this is a single misconfiguration away from public PII leakage.
- **Affected area**: `app/api/data/route.ts`
- **Likelihood / Impact / Risk**: Medium / High / **High**
- **Effort**: Low
- **Cost**: Low
- **Scope**: Localised
- **Recommended fix**: Return 401 immediately when `user` is null; consider also paginating by table or moving the heavy aggregate to per-table endpoints — a single "dump everything" endpoint is a magnet for misuse.

### F7 — Weak password policy

- **Description**: `app/api/users/route.ts:20` and `app/api/users/[userId]/password/route.ts:58` accept passwords of length ≥6. Modern guidance (NIST SP 800-63B) recommends ≥8 with breached-password rejection.
- **Affected area**: `app/api/users/route.ts`, `app/api/users/[userId]/password/route.ts`
- **Likelihood / Impact / Risk**: Medium / Medium / Medium
- **Effort**: Low
- **Cost**: Low
- **Scope**: Localised
- **Recommended fix**: Bump the Zod minimum to ≥10 (or ≥12 for admins), and configure Supabase Auth → Settings → Password Strength to "strong" so the `auth.admin.updateUserById` call also enforces it server-side.

### F8 — `patchJobSchema.passthrough()` accepts unknown fields

- **Description**: `app/api/jobs/[id]/route.ts:56` ends the schema with `.passthrough()`. Today the route only reads named keys, but any future contributor who spreads `body` into an `update({ ...body })` call inherits an attacker-controlled column-injection vector.
- **Affected area**: `app/api/jobs/[id]/route.ts`
- **Likelihood / Impact / Risk**: Low / Medium / Medium
- **Effort**: Low
- **Cost**: Low
- **Scope**: Localised
- **Recommended fix**: Drop `.passthrough()` (default `.strip()` behaviour) — Zod will silently ignore unknown keys, removing the latent footgun.

### F9 — PostgREST `.or()` operator injection in `/api/customers` search

- **Description**: `app/api/customers/route.ts:25-28` and `lib/audit.ts:251-256` build PostgREST `.or(...)` filters by string-concatenating user input. Only `,`, `%`, and `_` are escaped — but PostgREST's `or()` parser also splits on `(` and `)` and recognises operators like `eq.`, `is.`, `not.`. A crafted query (`x).or(id.eq.<known-id>` or similar) could change the OR semantics or expose rows beyond the intended `limit(25)`.
- **Affected area**: `app/api/customers/route.ts`, `lib/audit.ts`
- **Likelihood / Impact / Risk**: Medium / Medium / Medium
- **Effort**: Low
- **Cost**: Low
- **Scope**: Localised (two call sites)
- **Recommended fix**: Build the OR clauses with `.or(..., { foreignTable: ... })` after escaping `,`, `(`, `)`, `%`, `_`; or do four parallel `ilike` queries and merge in Node. Add a length cap (already partially present in audit) and reject anything matching `[(),]`.

### F10 — `/api/templates` PATCH missing auth + role gate

- **Description**: `app/api/templates/route.ts:24-67` writes templates with no `getUser()`, no role check, and a hard-coded `actor: "admin"` audit row. RLS may catch unauthenticated callers, but defense-in-depth is missing and the audit trail is misleading. (Also see F5.)
- **Affected area**: `app/api/templates/route.ts`
- **Likelihood / Impact / Risk**: Medium / Medium / Medium
- **Effort**: Low
- **Cost**: Low
- **Scope**: Localised
- **Recommended fix**: Use `requireAdminSettingsAccess()` pattern (already exists in `lib/settings-access.ts`) and source actor from the authenticated profile.

### F11 — `/api/payments` POST: missing auth + Zod, spoofable actor

- **Description**: `app/api/payments/route.ts:5-46` does not call `getUser()`, has no Zod validation, and writes the request's `body.actor` straight into `audit_logs`. Combined with F3, any authenticated session can record arbitrary payments against any booking — directly impacting "deposit_paid" and "final_paid" gates.
- **Affected area**: `app/api/payments/route.ts`
- **Likelihood / Impact / Risk**: Medium / Medium / Medium (possible escalation to High once F3 is fixed but this one is missed — consultants could still record forged payments unless RLS or this route blocks it)
- **Effort**: Low
- **Cost**: Low
- **Scope**: Localised
- **Recommended fix**:
  1. Add auth check (401 on no user).
  2. Add Zod (`bookingId UUID`, `amount > 0`, `receivedAt datetime`, `method enum`).
  3. Verify the booking exists and that the profile has `consultant`/`manager`/`admin` clearance.
  4. Set `actor` from the authenticated profile.

### F12 — Cron secret comparison is non-constant-time

- **Description**: `app/api/cron/email-sync/route.ts:7` and `app/api/cron/pipeline-auto-close/route.ts:42` use `authHeader !== 'Bearer ' + process.env.CRON_SECRET`. JavaScript string comparison short-circuits on first mismatch. In practice, network jitter dominates and exploitation is impractical, but the constant-time alternative is a one-liner.
- **Affected area**: `app/api/cron/email-sync/route.ts`, `app/api/cron/pipeline-auto-close/route.ts`
- **Likelihood / Impact / Risk**: Low / Low / Low
- **Effort**: Low
- **Cost**: Low
- **Scope**: Localised
- **Recommended fix**: Compare with `crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from('Bearer ' + secret))` after first checking the lengths match.

### F13 — `proxy.ts` is not Next.js middleware

- **Description**: `proxy.ts` exports a function named `proxy` (and a Next.js-style `config.matcher`) but Next.js only auto-wires `middleware.ts` with an exported `middleware`. There is no `middleware.ts` in the repo and no other module imports `proxy`. The intended logged-in `/login → /app` redirect and Supabase token refresh on every request are therefore dead code in production. Functionally this is a bug, but it is also a security weakness because the `getUser()` token-refresh defence and stale-cookie clean-up never run.
- **Affected area**: `proxy.ts`
- **Likelihood / Impact / Risk**: Medium / Low / Low
- **Effort**: Low
- **Cost**: Low
- **Scope**: Localised
- **Recommended fix**: Rename to `middleware.ts` and rename the export to `middleware`, or add a `middleware.ts` that re-exports `proxy as middleware`. Verify in production logs that the matcher actually fires.

---

## 4. Priority Actions (highest risk vs lowest effort)

1. **F1 — Bump Next.js to ≥16.1.7.** One-line dep change; closes two known CVEs.
2. **F2 — Lock down `/api/enquiries`.** Add Zod + rate limit + CAPTCHA; stop overwriting existing customers from a public endpoint.
3. **F3 — Replace `USING (true)` RLS with role-aware policies.** Highest-impact change; combine with the existing JWT clearance-level hook.
4. **F4 + F5 — Add auth/role gates and HTML sanitization** to `/api/correspondence` and `/api/templates`; switch the template preview to a sandboxed iframe.
5. **F6, F10, F11 — Add `auth.getUser()` checks** to `/api/data`, `/api/templates`, and `/api/payments` and audit with the real authenticated actor (small, mechanical fixes).
6. **F8, F9, F12 — Quick hygiene wins:** drop `.passthrough()`, escape `(` `)` in PostgREST `or()` filters, and use `crypto.timingSafeEqual` in cron routes.
7. **F7 — Raise password minimum** to 10+ chars.
8. **F13 — Wire `proxy.ts` as `middleware.ts`** (or delete it if intentionally unused).

---

## Sources consulted (external)

- Vercel changelog: [Summary of CVE-2026-23869](https://vercel.com/changelog/summary-of-cve-2026-23869)
- Vercel: [Summary of CVE-2026-23864](https://vercel.com/changelog/summary-of-cve-2026-23864)
- Sentinel One: [CVE-2026-27978 Vercel Next.js CSRF](https://www.sentinelone.com/vulnerability-database/cve-2026-27978/)
- HeroDevs: [CVE-2026-27980 Next.js disk DoS](https://www.herodevs.com/vulnerability-directory/cve-2026-27980)
- React advisory: [Denial of Service and Source Code Exposure in React Server Components](https://react.dev/blog/2025/12/11/denial-of-service-and-source-code-exposure-in-react-server-components)
- GitLab Advisories: [CVE-2026-3455 mailparser XSS](https://advisories.gitlab.com/pkg/npm/mailparser/CVE-2026-3455/) (already mitigated by `mailparser ^3.9.8 ≥ 3.9.3`)
