# Security Review — Luxus Sales System

| Field | Value |
| --- | --- |
| Repository | `hawkcoding/v0-luxu-sales-system` |
| Branch reviewed | `claude/friendly-curie-huuu4h` |
| Run date | 2026-06-13 |
| App version | 3.22 (`lib/version.ts`) |
| Total findings | 12 |
| Highest-risk issue | Unauthenticated public POST `/api/enquiries` uses service-role client and lacks Zod validation |
| Lowest-risk issue | Weak `SUPABASE_SERVICE_ROLE_KEY` shape check in `lib/supabase/server.ts` |
| Overall security posture | **Moderate** |

---

## 1. Summary

- **12 findings** identified across application logic, configuration, authn/z, and data handling.
- **Highest risk:** the public `POST /api/enquiries` route (`app/api/enquiries/route.ts:410`) takes an unauthenticated JSON payload, uses `createServiceClient()` (which bypasses RLS), and writes to `customers`, `bookings`, `booking_suites`, `travellers`, `booking_transport_requests`, `audit_logs`, and `quotes` with **no Zod validation** despite an in-source comment claiming there is one. Combined with no rate limit and no CAPTCHA, this is an internet-exposed mass-insert / spam / data-pollution surface.
- **Lowest risk:** `createServiceClient()` validates `SUPABASE_SERVICE_ROLE_KEY` only by checking that it contains a `.` — a trivial sanity check that adds little defence. The value still has to be a real JWT for Supabase to accept it, so the practical exposure is minimal.
- **Posture:** Most authenticated routes correctly use `createSessionClient()`, gate access with `requireUser`/`requireRole`/`requireAdmin`, validate with Zod, and write audit logs. The pattern is consistent and well-thought-out. The weak points cluster around the **single public POST endpoint**, **missing security response headers**, **template HTML rendering**, and **weak password policy**.

---

## 2. Risk Matrix

| # | Issue | Likelihood | Impact | Risk |
| --- | --- | --- | --- | --- |
| 1 | Public `POST /api/enquiries` — no auth, no Zod, service-role client, no rate limit | High | High | **Critical** |
| 2 | Stored XSS via template `bodyHtml` rendered with `dangerouslySetInnerHTML` | Medium | High | **High** |
| 3 | Voucher-asset SVG upload trusts client `file.type`, served from public bucket | Medium | High | **High** |
| 4 | No HTTP security headers (CSP / HSTS / X-Frame-Options / Referrer-Policy / X-Content-Type-Options) | High | Medium | **High** |
| 5 | Weak password policy — minimum length 6 (admin set + admin reset) | Medium | High | **High** |
| 6 | Audit `POST /api/audit` allows any logged-in user to write arbitrary actor/action/entityType — log tampering | Medium | Medium | **Medium** |
| 7 | Customer search `or()` filter only partly escapes user input (`,`, `%`, `_`) — PostgREST filter injection surface | Low | Medium | **Medium** |
| 8 | Cron secret comparison is a non-constant-time string equality (timing oracle) | Low | Medium | **Medium** |
| 9 | Verbose error responses leak Supabase error messages and 500 details in non-production | Low | Medium | **Medium** |
| 10 | Dev quick-login bundled into production source with hard-coded staff emails | Low | Medium | **Low** |
| 11 | Supplier-credentials key derived via single SHA-256 round on `EMAIL_CREDENTIAL_ENCRYPTION_KEY` — no salt, no KDF | Low | Medium | **Low** |
| 12 | `SUPABASE_SERVICE_ROLE_KEY` shape validation is just `.includes(".")` | Low | Low | **Low** |

---

## 3. Detailed Findings

### Finding 1 — Public `POST /api/enquiries` is unauthenticated, unvalidated, and service-role

- **Affected area:** `app/api/enquiries/route.ts:410-704`
- **Description:** The POST handler reads `await req.json()`, calls `createServiceClient()` (which bypasses RLS), then writes to `customers`, `bookings`, `booking_suites`, `travellers`, `booking_transport_requests`, `quotes`, `quote_line_items`, and `audit_logs` — all from a payload that is **never validated with Zod**. The comment on line 572–573 (`Travellers arrive from an external webhook payload; shape is validated at the Zod boundary above`) is incorrect: there is no Zod boundary in this handler. Fields like `body.travellers`, `body.childTravellers`, `body.transportRequests`, `body.extractedJson`, and `body.rawText` are accepted as arbitrary `Record<string, unknown>` and only individually narrowed. Any attacker can submit unlimited bookings, pollute the audit log, link arbitrary customers (`linkedCustomerId`), and overwrite customer records on existing emails (the resolver `update`s `customers` matched by email — see `resolveEnquiryCustomer` at line 742, which lets a stranger overwrite a real client's phone/country/title by submitting that customer's email). There is no CAPTCHA, no rate limit, no origin check.
- **Likelihood:** High — the route is publicly reachable, well-known (the web enquiry form posts to it), and trivially abusable from any HTTP client.
- **Impact:** High — data integrity (overwriting real customer rows, polluting audit log, exhausting `booking_number` sequence), business impact (consultants receive fake enquiries that look real, draft quotes get auto-generated), reputational risk.
- **Risk Level:** Critical
- **Effort estimate:** Medium — Zod schema for the full payload, switch overwriting `update()` to "fill-only-if-null" (or restrict to authenticated submissions), add per-IP and global rate limits (e.g. via `@upstash/ratelimit` or a Postgres-backed counter), and consider Turnstile/hCaptcha for the public form.
- **Cost implication:** Low–Medium (rate-limit infra may be a small running cost).
- **Scope of Fix:** Localised to `app/api/enquiries/route.ts` plus a shared rate-limit helper.
- **Recommended Fix:**
  1. Add a Zod schema for the entire request body, including `travellers`, `childTravellers`, `transportRequests`, `extractedJson`, `linkedCustomerId` (limit string lengths, array sizes, and number ranges; reject unknown fields with `.strict()` where practical).
  2. Change `resolveEnquiryCustomer` to **never overwrite non-null fields** on an existing customer (use `is("title", null)`-style guards as `customers/import/route.ts` already does).
  3. Add a per-IP rate limit (e.g. 10 enquiries / hour / IP) and a global budget guard.
  4. Add a server-verified CAPTCHA token field to the public web form, validated before any DB writes.
  5. Remove the misleading comment on line 572–573.

---

### Finding 2 — Stored XSS via email template `bodyHtml`

- **Affected area:** `app/app/templates/page.tsx:185`, written via `PATCH /api/templates` (`app/api/templates/route.ts`).
- **Description:** Templates store `body_html` as free-form HTML (up to 200 000 chars). The Templates page renders the preview with `dangerouslySetInnerHTML={{ __html: preview?.bodyHtml || "" }}`. Although the PATCH endpoint requires `admin`/`manager`, the absence of any sanitisation means a single compromised admin (or a future feature that lets lower-privileged users edit templates) immediately becomes session-takeover XSS for every other staff user opening the preview. The same `bodyHtml` is also rendered into outgoing emails — email clients ignore script, but inline image trackers and remote CSS still pose a risk.
- **Likelihood:** Medium — requires an authenticated manager/admin (or future role broadening), but the surface is permanent.
- **Impact:** High — session/cookie theft via the in-app preview, including admin sessions; potential CSRF-like pivot to user/admin endpoints.
- **Risk Level:** High
- **Effort estimate:** Low — add DOMPurify (or `sanitize-html`) at render time and/or at save time in the PATCH route.
- **Cost implication:** Low.
- **Scope of Fix:** Localised to `app/app/templates/page.tsx` and `app/api/templates/route.ts`.
- **Recommended Fix:** Sanitise on write (allowlist tags/attributes) **and** sanitise on render in the preview dialog. Block `<script>`, `on*=` attributes, `javascript:` URLs, and external CSS.

---

### Finding 3 — Voucher-asset upload trusts client MIME, public bucket, SVG XSS

- **Affected area:** `app/api/voucher-template/upload/route.ts:24-78`, bucket `voucher-assets` (public).
- **Description:** The handler permits `image/svg+xml`, `image/png`, and `image/webp` based solely on `file.type` from the client — no magic-byte sniff. Files are uploaded with `upsert: true` to a public bucket and a public URL is returned. An admin can therefore upload a `.svg` containing `<script>` (or `onload=`), and any browser that renders the SVG inline (e.g. via `<img>` is safe, but `<object>`, direct URL navigation, or future use in an `<iframe>` is **not**). Even the legitimate path posts to `voucher-assets/logo.svg` at a stable, publicly cacheable URL.
- **Likelihood:** Medium — requires admin upload, but admins are not generally trained on SVG XSS.
- **Impact:** High — XSS on the public Supabase Storage origin can steal CDN-scoped data or be used in social-engineering links.
- **Risk Level:** High
- **Effort estimate:** Medium — strip script-bearing nodes from SVGs (e.g. server-side `svgo` + `DOMPurify` with SVG profile), or drop SVG support entirely.
- **Cost implication:** Low.
- **Scope of Fix:** Localised to the upload route + the email rendering path that embeds the logo.
- **Recommended Fix:**
  1. Reject SVG, or sanitise the SVG body server-side before upload.
  2. Verify magic bytes (PNG `89 50 4E 47`, WebP `RIFF…WEBP`) — don't trust `file.type`.
  3. Serve voucher assets from a Storage URL that sets `Content-Disposition: attachment` or a strict `Content-Security-Policy` header.

---

### Finding 4 — No HTTP security headers

- **Affected area:** `next.config.mjs`, `proxy.ts` (Next 16 proxy middleware).
- **Description:** `next.config.mjs` has no `headers()` block. `proxy.ts` only refreshes Supabase auth — it does not set `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy`. The app is internet-facing and serves PII (customer names, emails, phones, travel dates, financials).
- **Likelihood:** High — exploitable by any clickjacking/MIME-sniffing/embed attack.
- **Impact:** Medium — clickjacking on consultant flows, lack of HSTS pinning, opportunistic data leak via Referer.
- **Risk Level:** High
- **Effort estimate:** Low.
- **Cost implication:** Low.
- **Scope of Fix:** Localised — add a `headers()` export in `next.config.mjs` or set the headers from `proxy.ts`.
- **Recommended Fix:** Add a static header block applying at minimum: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and a tightened CSP (start in `Report-Only` mode against `https://*.supabase.co`).

---

### Finding 5 — Weak password policy (6-char minimum)

- **Affected area:** `app/api/users/route.ts:20` (admin create — `z.string().min(6)`), `app/api/users/[userId]/password/route.ts:59` (admin reset — same minimum), Supabase default policy.
- **Description:** Both the create-user and admin-reset endpoints accept passwords as short as 6 characters with no complexity / breach check. Modern guidance (NIST SP 800-63B, OWASP ASVS L1/L2) is 8 minimum, 12 recommended, plus a check against known breached passwords. The dev-mode "Quick login" defaults to `password123` and lists five staff addresses in source (`app/login/page.tsx:16-22`).
- **Likelihood:** Medium — admins may pick a 6-char password; the default `password123` indicates 8-char passwords are normal here.
- **Impact:** High — credential stuffing / brute force into staff accounts with admin or manager clearance leaks customer PII and lets attackers reset other users' passwords.
- **Risk Level:** High
- **Effort estimate:** Low — raise the Zod minimum to 12 (or 10) and integrate a HaveIBeenPwned k-anon check, plus require MFA for admin/manager.
- **Cost implication:** Low.
- **Scope of Fix:** Localised to two API routes; possibly Supabase Auth config.
- **Recommended Fix:** Raise minimum length to 12, require at least one symbol/digit, add a breach check, and enforce MFA for `admin`/`manager` via Supabase MFA.

---

### Finding 6 — Audit log POST allows any user to forge entries

- **Affected area:** `app/api/audit/route.ts:48-117`.
- **Description:** Any authenticated user can `POST /api/audit` with arbitrary `entityType`, `entityId`, `action`, `beforeJson`, `afterJson`, and `metaJson`. `actor_user_id` is correctly pinned to the caller, but `entity_type/entity_id/action` are free strings — a consultant can write `entity_type: "user", action: "user_deleted"` against an admin to muddle forensic review, hide their own actions behind noise, or stage social-engineering trails. There is no role check beyond "logged in".
- **Likelihood:** Medium — requires only a logged-in account.
- **Impact:** Medium — audit trail integrity is degraded; investigations slow down.
- **Risk Level:** Medium
- **Effort estimate:** Low — restrict the route to a small allow-list of `action`/`entityType` strings, or remove the client-facing audit POST entirely and have the server write logs.
- **Cost implication:** Low.
- **Scope of Fix:** Localised.
- **Recommended Fix:** Use an enum/whitelist for `action` and `entityType`, or scope this endpoint to `admin`/`manager` only, or remove it and call `writeAuditLog` directly from server routes that already write the underlying entity.

---

### Finding 7 — Customer search `or()` filter is only partly escaped

- **Affected area:** `app/api/customers/route.ts:44-49`.
- **Description:** `query` is stripped of `,`, `%`, `_`, but `*`, `(`, `)`, `.`, and `:` pass through into a PostgREST `or(first_name.ilike.%…%,last_name.ilike.%…%, …)` expression. While `supabase-js` URL-encodes most special chars, the partial escape strategy is fragile and easy to break with future code changes — and the underlying parser semantics for `or()` are nontrivial. Defence-in-depth requires escaping `(` `)` `.` `:` as well, or building the filter via parameterised helpers.
- **Likelihood:** Low — current behaviour is mostly safe due to URL-encoding by the client lib.
- **Impact:** Medium — a future regression could leak rows via an injected condition, or DoS via expensive `ilike` patterns.
- **Risk Level:** Medium
- **Effort estimate:** Low — use `.ilike("first_name", `%${escaped}%`)` chained with `.or()` builder, or sanitise the full PostgREST grammar.
- **Cost implication:** Low.
- **Scope of Fix:** Localised.
- **Recommended Fix:** Escape `(`, `)`, `.`, `:`, `*`, `\` in addition to the current set, or use the typed builder helpers exposed by the supabase-js client.

---

### Finding 8 — Cron secret compared with non-constant-time equality

- **Affected area:** `app/api/cron/backup/route.ts:10`, `app/api/cron/email-sync/route.ts:7`, `app/api/cron/payment-reminders/route.ts:8`, `app/api/cron/pipeline-auto-close/route.ts`, `app/api/cron/quote-follow-ups/route.ts`.
- **Description:** Each cron endpoint compares `authHeader !== \`Bearer ${process.env.CRON_SECRET}\`` directly. JavaScript `!==` short-circuits at the first mismatching character, exposing a (small) timing oracle that can be amplified over the network.
- **Likelihood:** Low — Vercel front-end jitter makes remote timing attacks impractical, and the secret only triggers background jobs.
- **Impact:** Medium — a leaked cron secret lets an attacker trigger backup, email sync, payment reminders, etc., which can spam customers and increase Supabase egress costs.
- **Risk Level:** Medium
- **Effort estimate:** Low — use `crypto.timingSafeEqual` with equal-length Buffers.
- **Cost implication:** Low.
- **Scope of Fix:** Localised — extract a `verifyCronAuth(request)` helper used by all five cron routes.
- **Recommended Fix:** Replace direct string comparison with a length-checked `timingSafeEqual` against `Buffer.from(`Bearer ${process.env.CRON_SECRET}`)`. Reject early if lengths differ.

---

### Finding 9 — Verbose error responses in non-production

- **Affected area:** `app/api/customers/import/route.ts:66-90`, various `route.ts` that return `error.message` (e.g. `app/api/error-logs/route.ts:33`, `app/api/reports/[report]/route.ts:73`, `app/api/cron/*`).
- **Description:** `buildImportErrorResponse` includes Supabase `message/code/details/hint` when `NODE_ENV !== "production"`. Several other routes return `error.message` from Supabase straight to the client unconditionally. These can include table names, column names, and constraint identifiers — useful to an attacker enumerating the schema.
- **Likelihood:** Low — production builds suppress the diagnostic envelope, but several routes still leak raw `error.message`.
- **Impact:** Medium — accelerates targeted attacks against the data model.
- **Risk Level:** Medium
- **Effort estimate:** Low — always route through `safeSupabaseError` (which already logs server-side and returns a generic message).
- **Cost implication:** Low.
- **Scope of Fix:** Cross-cutting across `app/api/**/route.ts` — apply consistently.
- **Recommended Fix:** Replace every `NextResponse.json({ error: error.message })` with the `safeSupabaseError` helper from `lib/api/responses.ts`. Confirm the import route does not return phase/traceId on production.

---

### Finding 10 — Dev quick-login bundled in production source with hard-coded staff emails

- **Affected area:** `app/login/page.tsx:14-100, 208-241, 352-364`.
- **Description:** The login page ships hard-coded staff emails (`carmen@`, `dirk@`, `leonie@`, `monade@`, `douwlien@luxustravel.co.za`) and the default password `password123` inside `defaultDevQuickLoginPasswords`. The block is dead-code in production (`process.env.NODE_ENV === "development"` gate), but the constants are visible in the bundle to anyone reading the page source. They confirm valid staff usernames for phishing and credential stuffing.
- **Likelihood:** Low — the array shipping in the JS bundle requires only View-Source to read.
- **Impact:** Medium — leaks a list of high-value staff accounts and a likely reused default password.
- **Risk Level:** Low
- **Effort estimate:** Low — move defaults behind `process.env.NEXT_PUBLIC_*` only, and never check default emails/passwords into source.
- **Cost implication:** Low.
- **Scope of Fix:** Localised to `app/login/page.tsx`.
- **Recommended Fix:** Read defaults from environment variables that are only set in dev, or compile the block out at build time (`if (process.env.NODE_ENV !== "development") return null`). Rotate `password123` for any staff member who is still using it.

---

### Finding 11 — Single-round SHA-256 derivation of SMTP-password encryption key

- **Affected area:** `lib/inbound-email/crypto.ts:13`.
- **Description:** `getCredentialKey()` derives the AES-256-GCM key with a single SHA-256 over `EMAIL_CREDENTIAL_ENCRYPTION_KEY`, no salt, no KDF. The ciphertexts (per-row IVs and auth tags) are sound, but a weak / guessable secret turns into a key with no work factor. The migration's comment markets this as defence-in-depth for backups (Finding 1's restore route trusts the same key).
- **Likelihood:** Low — requires read access to the encrypted column or to a backup snapshot in private storage.
- **Impact:** Medium — exposes salesperson SMTP/IMAP passwords if the secret is ever weak or leaked.
- **Risk Level:** Low
- **Effort estimate:** Medium — switch to HKDF or scrypt/argon2 with a context-string salt; rotate ciphertexts on next save.
- **Cost implication:** Low.
- **Scope of Fix:** Localised to `lib/inbound-email/crypto.ts`, plus a migration to re-encrypt existing rows.
- **Recommended Fix:** Use `crypto.hkdfSync("sha256", secret, salt, "luxus-smtp-credential-v1", 32)` with a stable salt (or move to AWS KMS / Supabase Vault). Validate at startup that the secret is at least 32 bytes of entropy.

---

### Finding 12 — `SUPABASE_SERVICE_ROLE_KEY` shape check is `.includes(".")`

- **Affected area:** `lib/supabase/server.ts:54`.
- **Description:** The check rejects only the case where someone sets the key to a string with no `.`. Any JWT-shaped string (or any string containing a dot) passes. It does not enforce being a JWT, role=`service_role`, or matching the project ref. Minor — Supabase rejects malformed keys at API time — but the safety net implied by the throw is illusory.
- **Likelihood:** Low.
- **Impact:** Low — primarily a developer-experience issue.
- **Risk Level:** Low
- **Effort estimate:** Low — decode the JWT and check `role === "service_role"` and `aud` matches the project ref.
- **Cost implication:** Low.
- **Scope of Fix:** Localised.
- **Recommended Fix:** Decode the JWT payload, verify `role === "service_role"`, and fail loudly otherwise.

---

## 4. Priority Actions

Address in this order — best risk-reduction per unit of effort first.

1. **(Critical, Medium effort)** Lock down `POST /api/enquiries` (Finding 1) — add Zod schema, stop overwriting existing customer fields, add rate limiting + CAPTCHA, fix the misleading "validated above" comment.
2. **(High, Low effort)** Add HTTP security headers in `next.config.mjs` or `proxy.ts` (Finding 4).
3. **(High, Low effort)** Sanitise template `bodyHtml` on save and on render (Finding 2).
4. **(High, Low effort)** Raise password minimum to 12, integrate breach check, require MFA for admin/manager (Finding 5).
5. **(High, Medium effort)** Drop or sanitise SVG voucher uploads; magic-byte-sniff PNG/WebP (Finding 3).
6. **(Medium, Low effort)** Restrict `POST /api/audit` to a whitelisted action/entity set or to admin-only (Finding 6).
7. **(Medium, Low effort)** Switch all cron-secret comparisons to `timingSafeEqual` via a shared helper (Finding 8).
8. **(Medium, Low effort)** Route every API error through `safeSupabaseError`; verify production never returns Supabase `error.message` (Finding 9).
9. **(Medium, Low effort)** Tighten customer-search escaping in `app/api/customers/route.ts` (Finding 7).
10. **(Low, Low effort)** Strip the hard-coded staff emails from `app/login/page.tsx` (Finding 10).
11. **(Low, Medium effort)** Replace SHA-256 derivation with HKDF or KMS-backed key (Finding 11).
12. **(Low, Low effort)** Validate the service-role JWT structure (Finding 12).

---

_Generated by automated security review of branch `claude/friendly-curie-huuu4h` at app version 3.22._
