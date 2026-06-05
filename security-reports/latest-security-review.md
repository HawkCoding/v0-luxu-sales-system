# Security Review — Luxus Sales System

| | |
|---|---|
| **Repository** | `hawkcoding/v0-luxu-sales-system` |
| **Branch reviewed** | `claude/friendly-curie-SbU8Q` |
| **Run date** | 2026-06-05 |
| **App version (`lib/version.ts`)** | 3.22 |
| **Overall security posture** | **Poor** — multiple high-impact authorization gaps |
| **Highest-risk issue** | Permissive Postgres RLS (`biz_*` policies use `USING (true)`) — any authenticated user (including `readonly`) can read/modify/delete all customer/booking/quote/invoice data via the browser anon key |
| **Lowest-risk issue** | Hardcoded `password123` default for dev quick-login (gated by `NODE_ENV === "development"`) |
| **Total findings** | 11 |

---

## 1. Summary

The system layers strong-looking role checks in the Next.js API layer, but those checks are bypassed end-to-end by two architectural weaknesses:

1. **RLS is permissive** — `biz_select/insert/update/delete` policies on `bookings`, `customers`, `quotes`, `quote_line_items`, `payments`, `documents`, `correspondences`, `itineraries`, `travellers`, `booking_suites` all use `USING (true)` / `WITH CHECK (true)` for the `authenticated` role. A signed-in user (even a `readonly`) can talk directly to PostgREST with the anon key + their JWT and CRUD every record.
2. **The public `POST /api/enquiries` route uses the service-role client and accepts arbitrary JSON** with no Zod schema. It honours attacker-controlled `linkedCustomerId`, `supplierId`, `routeId`, `extractedJson`, free-form `notes`/`raw_text`, and an array of travellers — all written to the database with full privileges. There is no rate limiting, no CAPTCHA, no origin check.

Combined with permissive storage policies on `attachments` and `vouchers`, the practical effect is that any authenticated staff member can exfiltrate every customer record and every uploaded document.

## 2. Risk Matrix

| # | Issue | Likelihood | Impact | Risk Level |
|---|---|---|---|---|
| 1 | Permissive RLS on all core business tables (`biz_*` USING true) | High | High | **Critical** |
| 2 | Public `POST /api/enquiries` with service-role client and no Zod validation | High | High | **Critical** |
| 3 | Storage bucket policies (`attachments`, `vouchers`) allow any authenticated user to read/write any object | High | High | **High** |
| 4 | Stored XSS via unsanitised `dangerouslySetInnerHTML` in template preview | Medium | High | **High** |
| 5 | `GET /api/enquiries` exposes all customer PII to any authenticated user (no role check) | High | Medium | **High** |
| 6 | Non-constant-time cron secret comparison | Low | Medium | **Medium** |
| 7 | Weak password policy (6-char minimum on user creation) | Medium | Medium | **Medium** |
| 8 | No security headers (CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy) | Medium | Medium | **Medium** |
| 9 | Open-redirect-adjacent handling of `next` param in `/auth/callback` (only checks `startsWith("/")`) | Low | Medium | **Low/Medium** |
| 10 | Email-credential KDF is bare `sha256(secret)` (no HKDF / no salt) | Low | Medium | **Low/Medium** |
| 11 | Dev quick-login defaults: hardcoded staff emails + `password123` in source | Low | Low | **Low** |

## 3. Detailed Findings

### 1. Permissive RLS on all core business tables — **Critical**

- **Description**: Policies created in `supabase/migrations/20260308095136_remote_schema.sql` for `bookings`, `customers`, `quotes`, `quote_line_items`, `payments`, `documents`, `correspondences`, `itineraries`, `travellers`, `booking_suites` are of the form `FOR <op> TO authenticated USING (true) WITH CHECK (true)`. RLS is effectively off for the `authenticated` role.
- **Affected area**: `supabase/migrations/20260308095136_remote_schema.sql`; every table listed above.
- **Likelihood / Impact / Risk**: High / High / **Critical**
- **Effort**: High (cross-cutting policy redesign)
- **Cost**: High
- **Scope**: Cross-cutting — every business table and many API consumers.
- **Recommended fix**: Replace `USING (true)` with policies tied to `public.auth_has_role(...)` (already defined in the same migration) and, where relevant, ownership/assignment columns (`owner_user_id`, `assigned_salesperson_id`). At minimum, restrict UPDATE/DELETE to `manager`/`admin` and gate SELECT by role + assignment. Add equivalent regression tests under `tests/`.

### 2. Public `POST /api/enquiries` uses service-role client without Zod validation — **Critical**

- **Description**: `app/api/enquiries/route.ts:410-704` is the public intake (web form + paste import). It calls `createServiceClient()` (bypassing RLS) and parses `req.json()` directly. The misleading comment on line 572 (“shape is validated at the Zod boundary above”) is false — there is no Zod schema. Attacker-controlled `linkedCustomerId` is honoured (`app/api/enquiries/route.ts:440-453`, used as a primary-key lookup against `customers`); arbitrary `extractedJson` is persisted as JSON; arbitrary `travellers`/`childTravellers` arrays are inserted into `travellers`; `supplierId`, `routeId`, `suiteTypeId`, etc. accept any UUID; `rawText` is unbounded. No rate limit, no CAPTCHA, no origin check.
- **Affected area**: `app/api/enquiries/route.ts` (POST), `lib/job-numbering.ts`, `lib/import/*`.
- **Likelihood / Impact / Risk**: High / High / **Critical**
- **Effort**: Medium (Zod schema + body size cap + rate limiter)
- **Cost**: Medium
- **Scope**: Localised to the enquiries POST handler, but touches the public attack surface of the whole app.
- **Recommended fix**:
  - Define a Zod schema covering every accepted field and `.strict()` reject unknown keys.
  - Cap request body size (Next.js `route segment config` or upstream gateway).
  - Add a per-IP rate limit (e.g. Upstash Ratelimit or Vercel Edge Middleware).
  - Stop trusting `linkedCustomerId` from anonymous callers — only honour it when there's an authenticated session and the user has access to that customer.
  - Optionally require an HMAC or Turnstile token when the request originates from the public form.

### 3. Storage bucket policies grant full access to any authenticated user — **High**

- **Description**: `supabase/migrations/20260518134801_attachments_and_booking_notes.sql` and `…20260508143000_voucher_pdf_storage.sql` create `attachments` / `vouchers` storage policies of the form `FOR <op> TO authenticated USING (bucket_id = '<bucket>')`. There is no path/ownership scoping. Any authenticated user can list, download, overwrite, and delete every booking's documents (quote PDFs, invoices, vouchers, proofs of payment) via `supabase.storage.from(...).list()` from the browser.
- **Affected area**: Storage RLS for `attachments`, `vouchers`, and the document/voucher pipelines that depend on them.
- **Likelihood / Impact / Risk**: High / High / **High**
- **Effort**: Medium
- **Cost**: Medium
- **Scope**: Cross-cutting — storage + every consumer that reads or writes signed URLs.
- **Recommended fix**: Scope policies using `storage.foldername(name)[1]` (the booking ID prefix used in `app/api/documents/upload/route.ts:86`) so that the authenticated user must either be the booking owner/assignee or have `manager`/`admin` clearance. Move all client-side downloads to server-side signed URLs created in the API layer.

### 4. Stored XSS via unsanitised template preview HTML — **High**

- **Description**: `app/app/templates/page.tsx:185` renders `preview?.bodyHtml` with `dangerouslySetInnerHTML`. Template bodies are persisted server-side and editable through the templates UI; any user with write access to a template can plant a script that runs in another admin's authenticated session.
- **Affected area**: `app/app/templates/page.tsx` plus template-storage tables/APIs.
- **Likelihood / Impact / Risk**: Medium / High / **High**
- **Effort**: Low
- **Cost**: Low
- **Scope**: Localised to the preview component (plus general CSP improvements).
- **Recommended fix**: Sanitise with DOMPurify (`isomorphic-dompurify` works in Server/Client Components) before rendering, or render via an `<iframe sandbox>` with a strict allowlist of tags. Pair with a strong CSP (see finding #8).

### 5. `GET /api/enquiries` discloses all customer PII to any signed-in user — **High**

- **Description**: `app/api/enquiries/route.ts:313-407` only checks that a user is authenticated; it then returns every booking (incl. embedded `customer.email`, `first_name`, `last_name`, `title`) regardless of role or assignment. A `readonly` or compromised low-privilege account can dump the customer book.
- **Affected area**: `app/api/enquiries/route.ts`; same shape applies to several sibling list routes that should also be audited.
- **Likelihood / Impact / Risk**: High / Medium / **High**
- **Effort**: Low (add `requireRole(['admin','manager','consultant'])` + assignment-scope filter for non-managers)
- **Cost**: Low
- **Scope**: Localised, with a sweep of other list routes recommended.
- **Recommended fix**: Reuse `requireRole` from `lib/api/auth.ts` and limit non-manager queries with `.or('owner_user_id.eq.<uid>,assigned_salesperson_id.eq.<uid>')`. After finding #1 is fixed, RLS will provide defence in depth.

### 6. Non-constant-time cron secret comparison — **Medium**

- **Description**: All five cron routes (`app/api/cron/backup/route.ts:10`, `…/email-sync/route.ts:7`, `…/pipeline-auto-close/route.ts:42`, `…/payment-reminders/route.ts:8`, `…/quote-follow-ups/route.ts:8`) compare the `Authorization` header against `Bearer ${process.env.CRON_SECRET}` with `!==`. Each cron route also runs with the service-role client.
- **Affected area**: `app/api/cron/**`.
- **Likelihood / Impact / Risk**: Low / Medium / **Medium**
- **Effort**: Low
- **Cost**: Low
- **Scope**: Localised (5 files).
- **Recommended fix**: Compare with `crypto.timingSafeEqual` over fixed-length buffers, and centralise the check in a small helper (`lib/api/cron-auth.ts`) so all five routes use the same constant-time path.

### 7. Weak password policy — **Medium**

- **Description**: `app/api/users/route.ts:20` requires a minimum of 6 characters when admins create staff users. This is below current NIST SP 800-63B guidance (≥ 8) and Supabase's own newer defaults, and applies to accounts that the in-app role checks treat as fully privileged.
- **Affected area**: `app/api/users/route.ts`, plus the admin-set-password route under `app/api/users/[userId]/password/route.ts`.
- **Likelihood / Impact / Risk**: Medium / Medium / **Medium**
- **Effort**: Low
- **Cost**: Low
- **Scope**: Localised.
- **Recommended fix**: Raise the minimum to 12 characters, reject the top common-password list, and force a password change on first login. Mirror the same rules in Supabase Auth settings so client-side and admin-set flows match.

### 8. No security headers — **Medium**

- **Description**: `next.config.mjs` is a no-op aside from `images.unoptimized`. No `headers()` function, no CSP, no `X-Frame-Options`/`frame-ancestors`, no `Referrer-Policy`, no `Permissions-Policy`. The app therefore relies on Vercel's bare defaults.
- **Affected area**: `next.config.mjs`, `proxy.ts`.
- **Likelihood / Impact / Risk**: Medium / Medium / **Medium**
- **Effort**: Low
- **Cost**: Low
- **Scope**: Localised (config change).
- **Recommended fix**: Add a `headers()` block returning a strict CSP (allowing only `self`, the Supabase project URL, Resend, and Vercel Analytics), `X-Frame-Options: DENY` (or `frame-ancestors 'none'`), `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.

### 9. Open-redirect-adjacent `next` param handling — **Low/Medium**

- **Description**: `app/auth/callback/route.ts:4-7` accepts any `next` that `startsWith("/")` and concatenates it after `origin`. Inputs like `next=//evil.com/path` produce `https://app/<…>//evil.com/path`. Modern browsers normalise this and stay on origin, so an outright redirect is unlikely, but the validation is fragile and doesn't account for backslash variants or future Next.js URL parsing changes.
- **Affected area**: `app/auth/callback/route.ts`.
- **Likelihood / Impact / Risk**: Low / Medium / **Low/Medium**
- **Effort**: Low
- **Cost**: Low
- **Scope**: Localised.
- **Recommended fix**: Allowlist destinations explicitly, or require `next` to be a single-segment path matching `/^\/[a-zA-Z0-9/_-]+$/` and not start with `//` / `/\`.

### 10. Email-credential encryption KDF is bare SHA-256 — **Low/Medium**

- **Description**: `lib/inbound-email/crypto.ts:6-14` derives the AES-256-GCM key with `createHash('sha256').update(secret).digest()`. AES-GCM with random 96-bit IVs is fine, but if an operator ever sets `EMAIL_CREDENTIAL_ENCRYPTION_KEY` to a low-entropy passphrase, brute-forcing the key is cheap because there's no salt and no work factor.
- **Affected area**: `lib/inbound-email/crypto.ts`, IMAP/SMTP credential storage path.
- **Likelihood / Impact / Risk**: Low / Medium / **Low/Medium**
- **Effort**: Low
- **Cost**: Low
- **Scope**: Localised.
- **Recommended fix**: Require a 32-byte base64 random secret (validate length) and use `hkdfSync('sha256', secret, salt, info, 32)` with a per-deployment salt, or simply require the raw 32-byte key and skip hashing entirely.

### 11. Dev quick-login defaults leak emails + use `password123` — **Low**

- **Description**: `app/login/page.tsx:14-23` ships hardcoded staff emails (`carmen@…`, `dirk@…`, `leonie@…`, `monade@…`, `douwlien@…`) and `password123` as the fallback dev quick-login. The block is gated by `NODE_ENV === "development"`, so it does not appear in production builds, but the constants still ship in the repo. If those emails ever correspond to live accounts where the password reuse is genuine, this is a credential leak in source.
- **Affected area**: `app/login/page.tsx` and any seed scripts that set those passwords (`supabase/seed.sql`, `scripts/seed-demo.mjs`).
- **Likelihood / Impact / Risk**: Low / Low / **Low**
- **Effort**: Low
- **Cost**: Low
- **Scope**: Localised.
- **Recommended fix**: Move the email/password defaults to `.env.local.example`-only configuration, and confirm no production account uses `password123`. Consider deleting the hardcoded defaults entirely and require the developer to set `NEXT_PUBLIC_DEV_QUICK_LOGIN_*` themselves.

---

## 4. Priority Actions

Tackle in this order — first three give the largest risk reduction per unit of effort:

1. **Finding #2 — Lock down `POST /api/enquiries`**: add Zod, ignore `linkedCustomerId` for anonymous callers, add per-IP rate limit. *High-impact, ~half a day of work.*
2. **Finding #5 — Add `requireRole` + assignment scoping to list endpoints** (`/api/enquiries` and any sibling that uses `createSessionClient` without a role check). *High-impact, ~a day.*
3. **Finding #4 — Sanitise template preview HTML**. *Single-line fix that closes a stored XSS.*
4. **Finding #3 — Tighten storage policies for `attachments` and `vouchers`** (path-prefix + role-based access). *Medium effort, removes the largest data-exfiltration surface.*
5. **Finding #1 — Tighten RLS** on the `biz_*` business tables. *Largest effort; this is the long-term defence-in-depth fix and should land before any external auditor review.*
6. **Findings #6, #7, #8** — quick wins (constant-time compare, raise password floor, add security headers).
7. **Findings #9, #10, #11** — schedule into the next maintenance pass.
