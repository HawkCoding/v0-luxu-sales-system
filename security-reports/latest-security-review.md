# Luxus Sales System — Security Review

| Field | Value |
| --- | --- |
| Repository | `hawkcoding/v0-luxu-sales-system` |
| Branch reviewed | `claude/friendly-curie-21pjta` |
| Run date | 2026-06-14 |
| Overall security posture | **Moderate** |
| Highest-risk issue | **H1** — Unauthenticated `POST /api/enquiries` uses the Supabase service-role client and accepts an unvalidated JSON body |
| Lowest-risk issue | **L4** — `SUPABASE_SERVICE_ROLE_KEY` shape check is a substring `.` test |
| Total findings | 15 |

---

## 1. Summary

The application uses Supabase RLS, Zod validation on most endpoints, AES-256-GCM for SMTP credential storage, role-gated API helpers (`requireUser`, `requireRole`, `requireAdminSettingsAccess`), and audit logging. Auth flows correctly use server-side `supabase.auth.getUser()` and the proxy/middleware (`proxy.ts`) refreshes sessions safely.

However, a public intake route bypasses RLS and skips Zod validation, no security headers / CSP are emitted, no rate limiting exists anywhere, and the password policy is 6 characters. These elevate the posture from Strong to Moderate. None of the findings are an active emergency, but H1 and H2 should be treated as priorities before the next release.

- **Total vulnerabilities/findings:** 15 (3 High, 6 Medium, 6 Low)
- **Highest risk:** H1 — `app/api/enquiries/route.ts:410-704` (public + service-role + no Zod)
- **Lowest risk:** L4 — service-role key shape check (`lib/supabase/server.ts:54`)

---

## 2. Risk Matrix

| # | Issue | Likelihood | Impact | Risk Level |
| --- | --- | --- | --- | --- |
| H1 | Public, unvalidated, RLS-bypassing enquiry intake | High | High | **Critical** |
| H2 | No security headers / CSP / HSTS | High | Medium | **High** |
| H3 | 6-character minimum password policy | Medium | High | **High** |
| M1 | Hard-coded dev quick-login emails + shared `password123` | Low | High | **Medium** |
| M2 | `dangerouslySetInnerHTML` on admin-editable template HTML, no sanitization | Medium | Medium | **Medium** |
| M3 | No rate limiting on outbound email + correspondence relay | Medium | Medium | **Medium** |
| M4 | SVG accepted as voucher logo/banner in public storage bucket | Low | Medium | **Medium** |
| M5 | Verbose diagnostic payloads outside production | Medium | Low | **Medium** |
| M6 | RLS lets consultants SELECT their own `encrypted_password` ciphertext | Medium | Medium | **Medium** |
| L1 | Console error logging of Supabase error details | Medium | Low | Low |
| L2 | JWT-derived role short-circuits stale-token revocation | Low | Medium | Low |
| L3 | No defense-in-depth CSRF (relies on cookie SameSite) | Low | Medium | Low |
| L4 | Service-role key shape check is `.includes(".")` | Low | Low | Low |
| L5 | Credential encryption KDF is plain SHA-256 (not memory-hard) | Low | Medium | Low |
| L6 | STARTTLS SMTP not forced to require TLS | Low | Medium | Low |

Severity ranking (highest → lowest): **H1, H2, H3, M2, M6, M3, M1, M4, M5, L2, L5, L6, L3, L1, L4.**

---

## 3. Detailed Findings

### H1 — Public RLS-bypassing enquiry intake with no Zod validation

- **Affected area:** `app/api/enquiries/route.ts:410-704` (`POST /api/enquiries`)
- **Description:**
  The handler explicitly uses `createServiceClient()` ("this route is public … so there is no authenticated user session to rely on") and reads fields off `body.*` without any schema validation. The body controls inserts into `customers`, `bookings`, `booking_suites`, `travellers`, `booking_transport_requests`, `quotes`, `quote_line_items`, and `audit_logs`. Numeric coercions are loose (`Number(body.extraNights)`), strings are passed through almost untouched, and `body.extractedJson` is spread into a `Json` column.
  There is no rate limit, no CAPTCHA / Turnstile, no origin check, and no honeypot. An anonymous attacker can:
  - Flood the database with bookings/customers/audit rows (storage + cost amplification).
  - Trigger arbitrarily many job-number allocations and PDF/quote creation attempts.
  - Poison audit logs with `actor: "consultant" | "system"` events (those exact strings are written when there is no session — see `route.ts:665`/`679`).
  - Cause type confusion in downstream readers when fields are wrong shapes.
- **Likelihood / Impact / Risk:** High / High / **Critical**
- **Effort:** Medium — write a Zod schema, gate with Turnstile/hCaptcha or signed origin token, add per-IP/per-day rate limit, and reject when `Origin` is missing/unknown for browser submissions.
- **Cost:** Low–Medium (CAPTCHA + an edge KV-backed limiter).
- **Scope of fix:** Localised to this route, plus a reusable rate-limit helper.
- **Recommended fix:**
  1. Define a strict Zod schema covering every consumed field (`name`, `surname`, `email`, `contactNumber`, `country`, `province`, `direction`, `packageOption`, `hotelOption`, `flightBooking`, `flightDepartureDate`, `noOfAdults/Children/Suites`, `childAges`, `extendStay`, `extraNights`, `additionalServices*`, `promotionCode`, `termsAccepted`, `rawText`, `extractedJson`, `linkedCustomerId`, `suiteSelections`, `suiteTypes`, `travellers`, `childTravellers`, `transportRequests`, `supplierId`, `supplier`). Reject on unknown keys (`.strict()`).
  2. Verify `Origin`/`Referer` matches the app host for browser callers; require a Turnstile/hCaptcha token for unauthenticated submissions.
  3. Add a rate limit by IP and email (e.g. Upstash Ratelimit on Vercel KV) — for example 5 requests/min/IP, 20/day/email.
  4. When `body.rawText`/paste-import is used, require an authenticated session and drop the service-role fall-back so RLS is enforced.
  5. Switch the `audit_logs.actor` value from the literal `"consultant"`/`"system"` to a tagged `"public_intake"` so anonymous submissions are obvious in reporting.

---

### H2 — No security headers / Content-Security-Policy / HSTS

- **Affected area:** `next.config.mjs`, `proxy.ts`, `vercel.json`
- **Description:**
  `next.config.mjs` only configures `images.unoptimized`. There is no `headers()` block, no middleware/proxy that emits `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy`. The app renders user-controlled HTML via `dangerouslySetInnerHTML` (see M2) and stores PDFs / attachments via signed URLs — a CSP would significantly reduce the impact of any successful XSS or supply-chain script injection. Without HSTS, a downgrade attack on a fresh client can intercept Supabase session cookies.
- **Likelihood / Impact / Risk:** High / Medium / **High**
- **Effort:** Low.
- **Cost:** Low.
- **Scope of fix:** Localised (`next.config.mjs` or `proxy.ts`).
- **Recommended fix:** Add a `headers()` entry in `next.config.mjs` that emits, at minimum:
  - `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://*.supabase.co; connect-src 'self' https://*.supabase.co https://api.resend.com; img-src 'self' data: https://*.supabase.co; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'`
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  Tighten `script-src` after auditing inline scripts (Next.js generates a small inline bootstrap — use a nonce).

---

### H3 — Weak password policy (6-character minimum)

- **Affected area:** `app/api/users/route.ts:20`, `app/api/users/[userId]/password/route.ts:59`
- **Description:**
  Both the user-creation and admin reset paths accept any password ≥ 6 characters. There is no breached-password check, no complexity guidance, and no MFA enforcement for admin accounts. NIST SP 800-63B recommends ≥ 8 characters with no composition rules; the practical industry baseline is 12 characters or a passphrase. Combined with H2 (no HSTS) and the lack of rate limiting on Supabase auth endpoints (M3), this materially raises credential-stuffing risk.
- **Likelihood / Impact / Risk:** Medium / High / **High**
- **Effort:** Low.
- **Cost:** Low.
- **Scope of fix:** Localised (two schemas).
- **Recommended fix:**
  - Increase the Zod `min` to 12 and add a `.refine` that rejects passwords found in a breached-password list (e.g. HIBP k-anonymity API) or run Supabase Auth's `pwned-passwords` integration.
  - Enforce MFA on `admin` and `manager` clearance levels (Supabase TOTP).
  - Update the email reset notification (`route.ts:115`) to warn the user if the password is shorter than the recommended length.

---

### M1 — Hard-coded dev quick-login emails with shared `password123` fallback

- **Affected area:** `app/login/page.tsx:14-100`, `.env.local.example:23-24`
- **Description:**
  `defaultDevQuickLoginEmails` lists five real staff aliases (`carmen@`, `dirk@`, `leonie@`, `monade@`, `douwlien@luxustravel.co.za`) and `defaultDevQuickLoginPasswords` contains `password123`. The quick-login is gated by `process.env.NODE_ENV === "development"`, so it should not ship to production — but the safety net is fragile: a Vercel preview deployment with `NODE_ENV !== "production"` (older Next.js behaviour) or an accidental DEMO_MODE flip would expose a one-click login as any of these accounts. The staff aliases also leak in the bundled client JS in any non-prod build, which is a directory-of-targets for phishing.
- **Likelihood / Impact / Risk:** Low / High / **Medium**
- **Effort:** Low.
- **Cost:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:**
  - Move the email/password defaults out of the source file and into local-only env vars (`NEXT_PUBLIC_DEV_QUICK_LOGIN_*`) so production bundles don't ship them.
  - Add a runtime check that also requires `process.env.NEXT_PUBLIC_LUXUS_ENV !== "production"` to belt-and-brace `NODE_ENV`.
  - Rotate the demo password and document it as throwaway-only.

---

### M2 — `dangerouslySetInnerHTML` over admin-editable template body

- **Affected area:** `app/app/templates/page.tsx:185`, `app/api/templates/route.ts:42-79`
- **Description:**
  The template preview renders `preview?.bodyHtml` directly via `dangerouslySetInnerHTML`. The body is stored unsanitized via `PATCH /api/templates` (200 000-character cap, no DOMPurify/sanitize-html). Admins and managers can store any markup, including `<script>`, `<iframe>`, or event handlers. Anyone with read access to the templates list (any authenticated user — `requireUser` only) will execute the script when they open the preview. Combined with H2 (no CSP) this is a stored XSS chain that can hijack other staff sessions.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**
- **Effort:** Low.
- **Cost:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:**
  - Run `bodyHtml` through `sanitize-html` (or DOMPurify in `jsdom`) on the server in the PATCH handler; reject submission if it contains `<script>`, event handlers, or external `src`.
  - On the client preview, render inside a sandboxed `<iframe sandbox="allow-same-origin">` to additionally isolate the document.
  - Add a CSP (H2) so even if the sanitizer regresses, inline scripts cannot run.

---

### M3 — No rate limiting on outbound email / correspondence relay

- **Affected area:** `app/api/correspondence/route.ts:85-360`, `app/api/voucher/generate/route.ts`, `app/api/vouchers/[id]/send/route.ts`, all auth flows
- **Description:**
  Any consultant role can hit `POST /api/correspondence` with up to 20 recipients and 5 attachments × 15 MB base64 each. There is no per-user, per-booking, or per-IP throttle, no per-hour cap, and no enforcement that recipients belong to the booking customer. Attackers (or a compromised consultant account) can use the system as an email relay against Resend's quota, send phishing as the company domain, or exhaust storage. The same lack of rate limiting applies to login/password-reset and the `salesperson_credentials` IMAP/SMTP sender (which connects to attacker-controlled hosts if smtp_host is set — see also L6).
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**
- **Effort:** Medium.
- **Cost:** Low–Medium.
- **Scope of fix:** Cross-cutting (rate-limit helper + per-route policies).
- **Recommended fix:**
  - Add a per-user rate limiter (e.g. Upstash Ratelimit) wrapped around the role-gated handlers: 30 sends/hour/user, 200/day/booking, etc.
  - Enforce that `to` recipients must be `booking.customer.email` (or an explicitly approved supplier list); reject arbitrary outbound addresses.
  - Add bytes/day quotas for attachments per user.

---

### M4 — SVG accepted as voucher logo/banner in a public bucket

- **Affected area:** `app/api/voucher-template/upload/route.ts:9-87` (bucket `voucher-assets`)
- **Description:**
  The upload route allows `image/svg+xml` (and PNG/WebP), writes to the `voucher-assets` bucket, then derives the **public** URL with `supabase.storage.from(BUCKET).getPublicUrl(path)`. SVGs can contain `<script>` / event handlers; if the resulting URL is visited directly (or embedded as `<object>`/`<iframe>` somewhere), the script runs. Even when used as `<img src=…>` inside the voucher HTML/PDF, SVG XLink/foreignObject features can leak data through external `href`. The endpoint is admin-only, but a compromised admin (or an SSRF that hits the bucket) can use this as a same-origin script payload host once the asset is fetched from the app domain.
- **Likelihood / Impact / Risk:** Low / Medium / **Medium**
- **Effort:** Low (block SVG) — Medium (sanitize SVG).
- **Cost:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:**
  - Drop SVG support entirely; require PNG/WebP only.
  - If SVG is required, sanitize with `svgo` + `DOMPurify` before storing, and serve via a route that emits `Content-Security-Policy: sandbox`, `Content-Disposition: attachment`, and `Content-Type: image/svg+xml; charset=utf-8` with `X-Content-Type-Options: nosniff`.

---

### M5 — Diagnostic details leak outside production

- **Affected area:** `app/api/customers/import/route.ts:66-90`, `app/api/cron/email-sync/route.ts:14-17`, several other routes returning `error.message`
- **Description:**
  `buildImportErrorResponse` returns `phase`, `traceId`, and the full Supabase error `details/hint/code` whenever `NODE_ENV !== "production"`. Vercel preview deployments commonly run with `NODE_ENV=production`, so this is normally safe — but any non-prod deploy that is reachable from the internet will leak schema and PostgREST hints. Cron route 500 responses similarly echo `error.message`. These are minor info leaks but help an attacker enumerate the schema or pivot a different vulnerability.
- **Likelihood / Impact / Risk:** Medium / Low / **Medium**
- **Effort:** Low.
- **Cost:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:**
  - Replace the `NODE_ENV` check with an allow-list env var (e.g. `LUXUS_DIAGNOSTICS=1`) so it is opt-in per environment.
  - In cron routes, return a generic message and only log the detailed cause.

---

### M6 — Consultant RLS allows reading own `encrypted_password` ciphertext

- **Affected area:** `supabase/migrations/20260516140000_salesperson_credentials.sql:46-60`, `lib/email/smtp-transport.ts:32-46`
- **Description:**
  The `salesperson_credentials_consultant_select_own` policy permits a consultant to `SELECT *` on their own row, including `encrypted_password`. App code uses a `SAFE_COLUMNS` projection that excludes the ciphertext, but a consultant can craft a direct PostgREST query (`supabase.from("salesperson_credentials").select("encrypted_password")`) through the public anon client and retrieve their own ciphertext. While the value is AES-256-GCM encrypted, exposing the ciphertext widens the attack surface (offline brute force, padding-oracle-style probing against the API, key-rotation risk) and bypasses the app's intentional column hiding.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**
- **Effort:** Medium.
- **Cost:** Low.
- **Scope of fix:** Localised (one migration + the SECURITY DEFINER helper).
- **Recommended fix:**
  - Drop the consultant SELECT policy and replace it with a SECURITY DEFINER view (or PostgREST RPC) that exposes only the safe columns.
  - Alternatively, revoke column-level `SELECT` on `encrypted_password` from the `authenticated` role and grant it only to `service_role`.
  - Add an integration test that asserts a consultant client cannot fetch `encrypted_password`.

---

### L1 — Verbose error logging in API routes

- **Affected area:** `app/api/users/route.ts:154-171`, `app/api/customers/import/route.ts:69-77`, `app/api/suppliers/helpers.ts` (multiple)
- **Description:** Server logs include Supabase error `message`, `code`, `details`, `hint`. These are server-side only but get shipped to Vercel logs and may leak the schema to whomever has log access. Not a direct vulnerability, but a hygiene issue worth tightening.
- **Likelihood / Impact / Risk:** Medium / Low / **Low**
- **Effort:** Low. **Cost:** Low. **Scope:** Cross-cutting.
- **Recommended fix:** Funnel all log output through `lib/error-log.ts` and redact `details`/`hint` fields.

---

### L2 — JWT `clearance_level` short-circuits stale-token revocation

- **Affected area:** `app/app/layout.tsx:18-39`, `lib/role-utils.ts`
- **Description:** When `extractRoleFromJwt` returns a role, the layout uses the JWT role and only checks `is_active`. If an admin demotes a user via `app_metadata` but the JWT is still valid (default Supabase JWT TTL is 1 hour), the UI continues to grant the higher role until the token rotates. DB access is still RLS-enforced, so the impact is limited to UI affordances and any in-page secrets — but it is a defence-in-depth gap.
- **Likelihood / Impact / Risk:** Low / Medium / **Low**
- **Effort:** Low. **Cost:** Low. **Scope:** Localised.
- **Recommended fix:** Always read `clearance_level` from `profiles` server-side, and force a JWT refresh (Supabase `auth.refreshSession`) whenever an admin changes another user's clearance.

---

### L3 — No CSRF defence-in-depth beyond cookie SameSite

- **Affected area:** all `POST/PATCH/DELETE` API routes
- **Description:** State-changing endpoints rely on Supabase cookies for auth. SameSite=Lax (Supabase default) blocks most cross-origin form posts, but does not protect against `<a target="_blank">` GET-triggered top-level navigations or against a malicious extension. A double-submit cookie or `Origin` header check would harden these endpoints.
- **Likelihood / Impact / Risk:** Low / Medium / **Low**
- **Effort:** Medium. **Cost:** Low. **Scope:** Cross-cutting.
- **Recommended fix:** In `proxy.ts`, reject any non-`GET/HEAD` request whose `Origin` does not match the app host. Also set `__Host-` prefix on session cookies if not already.

---

### L4 — Service-role key shape check is a `.includes(".")` test

- **Affected area:** `lib/supabase/server.ts:54`
- **Description:** A developer with any string containing a period passes the validation. Not a vulnerability per se; just a brittle guard.
- **Likelihood / Impact / Risk:** Low / Low / **Low**
- **Effort:** Low. **Cost:** Low. **Scope:** Localised.
- **Recommended fix:** Replace with a JWT structural test (three dot-separated base64url segments, header `alg`/`typ` parses).

---

### L5 — Credential encryption key is a plain SHA-256 derivation

- **Affected area:** `lib/inbound-email/crypto.ts:6-14`
- **Description:** `getCredentialKey()` returns `sha256(secret)` — fast, not memory-hard. If `EMAIL_CREDENTIAL_ENCRYPTION_KEY` is short or guessable, an attacker who exfiltrates the DB can brute-force the IMAP/SMTP passwords offline.
- **Likelihood / Impact / Risk:** Low / Medium / **Low**
- **Effort:** Low. **Cost:** Low. **Scope:** Localised.
- **Recommended fix:** Require the env var to be a base64-encoded 32-byte key (validate at startup) and use it directly, skipping the hash; or use HKDF-SHA-256 with a fixed `info` label. Document the rotation procedure.

---

### L6 — STARTTLS path does not force TLS upgrade

- **Affected area:** `lib/email/smtp-transport.ts:103-111`
- **Description:** When a consultant's credential is configured with `smtp_encryption = "starttls"` (or `"none"`), the transporter is created with `secure: false` and no `requireTLS: true`. If the SMTP server's STARTTLS handshake fails or is stripped, nodemailer will send the credentials over plaintext.
- **Likelihood / Impact / Risk:** Low / Medium / **Low**
- **Effort:** Low. **Cost:** Low. **Scope:** Localised.
- **Recommended fix:** When `smtp_encryption === "starttls"`, set `requireTLS: true`. Reject `smtp_encryption === "none"` for any production credential. Apply the same to the IMAP `ImapFlow` constructor.

---

## 4. Priority Actions

In order of risk-reduction per unit of effort:

1. **H2 — Add security headers / CSP / HSTS** (one file, blocks several other attack chains).
2. **H1 — Lock down `POST /api/enquiries`** (Zod schema + Turnstile + per-IP rate limit; consider keeping service-role only for the parsed CAPTCHA-verified path).
3. **H3 — Raise password minimum to 12 characters and integrate breached-password check.**
4. **M2 — Sanitize `bodyHtml` server-side and render previews in a sandboxed iframe.**
5. **M6 — Replace the consultant `SELECT *` policy on `salesperson_credentials` with a column-restricted view or revoke column SELECT.**
6. **M3 — Introduce a single Upstash-style rate-limit helper and apply to `/api/correspondence`, login, password reset, voucher send.**
7. **M1 — Move dev quick-login defaults out of source and require an explicit non-prod env flag.**
8. **M4 — Stop accepting SVG voucher uploads (or sanitize and serve as attachment).**
9. **M5 — Replace the `NODE_ENV` diagnostics gate with an explicit env flag.**

The Low findings (L1–L6) should be batched into a single hardening sprint once the items above are in flight.

---

## Appendix — Method & Scope

- Static review of: `app/`, `lib/`, `components/`, `supabase/migrations/`, `next.config.mjs`, `vercel.json`, `package.json`, `pnpm-lock.yaml`, `.env*.example`, `proxy.ts`.
- Dependency spot-checks: `next@16.1.6`, `@supabase/ssr@0.8.0`, `@supabase/supabase-js@2.98.0`, `nodemailer@8.0.7`, `imapflow@1.3.2`, `mailparser@3.9.8`, `zod@3.25.76`, `esbuild@0.27.3`, `resend@6.9.3`. No known unpatched CVEs against these versions as of the run date. Recommend a `pnpm audit --prod` and a Snyk/Trivy run in CI to catch advisories continuously.
- Not in scope: live penetration testing, Supabase project-level configuration review (e.g. JWT TTLs, MFA policy, storage CORS), Vercel WAF/Edge config, infrastructure secrets management.
