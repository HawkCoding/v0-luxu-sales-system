# Security Review — Luxus Sales System

| Field | Value |
|---|---|
| **Repository** | `hawkcoding/v0-luxu-sales-system` |
| **Branch reviewed** | `claude/friendly-curie-Lknc8` |
| **Run date** | 2026-05-26 |
| **Overall security posture** | **Moderate** |
| **Highest-risk issue** | Outdated Next.js 16.1.6 — multiple high-severity CVEs (proxy bypass, SSRF, DoS, XSS) |
| **Lowest-risk issue** | PostCSS `<8.5.10` build-time XSS (dev/build dependency only) |
| **Total findings** | 7 |

> Fresh scan. No memory of previous runs. Findings are tied to the actual code at the
> reviewed commit, not generic advice.

---

## 1. Summary

- **Total vulnerabilities: 7** (1 high, 2 medium-high, 2 medium, 2 low).
- **Highest-risk issue:** The project pins **Next.js `16.1.6`**, which `pnpm audit` flags
  against **9 high / 13 moderate / 3 low** advisories — including several **Middleware /
  Proxy bypass** CVEs, **SSRF**, **Denial of Service**, **App Router XSS**, and a
  **null-origin Server Actions CSRF bypass**. All are fixed in **`>=16.2.6`**. Network-
  exploitable, publicly documented, trivial to fix.
- **Lowest-risk issue:** **PostCSS `<8.5.10`** XSS advisory — a build-time dependency only,
  not reachable at runtime with trusted CSS.
- **Overall posture: Moderate.** Application-layer hygiene is strong: RLS-aware Supabase
  clients, centralized `requireUser`/`requireRole` authorization, Zod validation on most
  routes, AES-256-GCM-encrypted stored credentials, audit logging, safe (non-leaking) error
  responses, no committed secrets, open-redirect-safe auth callback, and route protection
  correctly placed in server layouts/route handlers rather than middleware. The score is
  held back from *Strong* by an out-of-date framework carrying many CVEs and by a
  public, unauthenticated intake endpoint that runs with the service-role (RLS-bypassing)
  client.

---

## 2. Risk Matrix

| # | Issue | Likelihood | Impact | Risk Level |
|---|---|---|---|---|
| 1 | Outdated Next.js 16.1.6 (proxy bypass / SSRF / DoS / XSS CVEs) | High | High | **High** |
| 2 | Public unauthenticated `/api/enquiries` POST on service-role client, no validation/rate-limit | High | Medium | **High** |
| 3 | Missing HTTP security headers (CSP, HSTS, X-Frame-Options, etc.) | Medium | Medium | **Medium** |
| 4 | CSV formula injection in audit export | Medium | Medium | **Medium** |
| 5 | `lodash` code injection + prototype pollution (transitive via `recharts`) | Low | Medium | **Low-Medium** |
| 6 | Credential key derived from raw SHA-256 (no KDF/salt), single key version | Low | Medium | **Low** |
| 7 | PostCSS `<8.5.10` XSS (build-time dependency) | Low | Low | **Low** |

**Severity ranking (most → least severe):** 1 → 2 → 3 → 4 → 5 → 6 → 7

---

## 3. Detailed Findings

### Finding 1 — Outdated Next.js (`16.1.6`) with multiple high-severity CVEs
- **Description:** `package.json` pins `next: 16.1.6`. `pnpm audit --prod` reports **25
  advisories** affecting this version (3 low / 13 moderate / 9 high). High-severity items
  include multiple **Middleware / Proxy bypass in App Router** (`GHSA-26hh-7cqf-hhc6`,
  `GHSA-492v-c6pp-mqqv`, `GHSA-267c-6grr-h53f`, `GHSA-36qx-fr4f-26g5`), **SSRF**
  (`GHSA-c4j6-fc7j-m34r`), and several **DoS via Server Components / connection exhaustion**
  (`GHSA-q4gf-8mx6-v5v3`, `GHSA-8h8q-6873-q5fj`, `GHSA-mg66-mrh9-m8jx`). Moderate items
  include App Router **XSS**, **HTTP request smuggling in rewrites** (`GHSA-ggv3-7p47-pfv8`),
  and **null-origin Server Actions CSRF bypass** (`GHSA-mq59-m269-xvcx`). The fixed line for
  all of these is **`>=16.2.6`**.
- **Affected area:** `package.json` (`next` dependency); framework-wide. Note: this app's
  route authorization lives in server layouts (`app/app/layout.tsx`) and per-route
  `getUser()` checks rather than in `proxy.ts`/middleware, which *limits* the blast radius of
  the middleware-bypass CVEs — but SSRF, DoS, XSS, and request-smuggling still apply.
- **Likelihood / Impact / Risk:** High / High / **High**
- **Effort estimate:** **Low** — bump to `next@^16.2.6` (or latest 16.x), reinstall, run
  `pnpm typecheck` + `pnpm test` + a smoke test.
- **Cost implication:** **Low**
- **Scope of fix:** Localised (single dependency) with cross-cutting verification.
- **Recommended fix:** `pnpm add next@latest` (target `>=16.2.6`), regenerate
  `pnpm-lock.yaml`, run the full test/typecheck/QA suite, and redeploy. Re-run `pnpm audit`
  to confirm zero high advisories on `next`.

---

### Finding 2 — Public, unauthenticated `/api/enquiries` POST using the service-role client
- **Description:** `app/api/enquiries/route.ts` `POST` is intentionally public (web form &
  paste import) and explicitly uses `createServiceClient()` — the **RLS-bypassing** client.
  It performs no authentication, **no Zod validation** of the body (it reads `body.*` fields
  directly, with `any[]` casts for travellers), and **no rate limiting / CAPTCHA**. A remote
  caller can therefore create unlimited `customers`, `bookings`, `quotes`, `quote_line_items`,
  `travellers`, and `audit_logs` rows, inject arbitrary PII / oversized payloads, and trigger
  relatively expensive work (country-alias loading, package matching, draft-quote pricing,
  job-number allocation) on every request. No `rate-limit`/`throttle`/`upstash` helper exists
  anywhere in `lib/` or `app/`.
- **Affected area:** `app/api/enquiries/route.ts` (POST handler, `resolveEnquiryCustomer`,
  `createDraftQuoteForBooking`).
- **Likelihood / Impact / Risk:** High / Medium / **High** — trivially reachable; impact is
  data-store pollution, spam, and resource/DoS rather than direct data exfiltration.
- **Effort estimate:** **Medium** — add a Zod schema for the request body (with string
  length caps and array-size caps), and add rate limiting (e.g. IP/edge rate limit or a
  CAPTCHA/turnstile token) before any DB writes.
- **Cost implication:** **Low-Medium**
- **Scope of fix:** Mostly localised to the route; rate-limiting infra may be reusable
  cross-cutting.
- **Recommended fix:** (1) Define and `safeParse` a strict Zod schema for the body; reject
  with `400` on failure and bound array lengths (`travellers`, `transportRequests`,
  `suiteSelections`). (2) Add rate limiting / bot protection for unauthenticated submissions.
  (3) Keep the service-role client only for the minimal inserts that genuinely need it.

---

### Finding 3 — Missing HTTP security headers
- **Description:** `next.config.mjs` contains only `images.unoptimized` and defines no
  `async headers()` block. The app emits no **Content-Security-Policy**, **Strict-Transport-
  Security (HSTS)**, **X-Frame-Options** / `frame-ancestors`, **X-Content-Type-Options:
  nosniff**, **Referrer-Policy**, or **Permissions-Policy**. This removes defense-in-depth
  against clickjacking, MIME sniffing, and XSS, and weakens transport security.
- **Affected area:** `next.config.mjs`.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**
- **Effort estimate:** **Low** — add a `headers()` function returning the standard set.
- **Cost implication:** **Low**
- **Scope of fix:** Cross-cutting (applies app-wide) but implemented in one file. A strict
  CSP may need iteration to avoid breaking inline scripts/styles.
- **Recommended fix:** Add `async headers()` to `next.config.mjs` returning `HSTS`
  (`max-age=63072000; includeSubDomains; preload`), `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY` (or `frame-ancestors 'none'` via CSP), `Referrer-Policy:
  strict-origin-when-cross-origin`, a tuned `Content-Security-Policy`, and a restrictive
  `Permissions-Policy`.

---

### Finding 4 — CSV formula injection in audit export
- **Description:** `lib/export-audit.ts` `csvCell()` quotes values and escapes embedded
  double-quotes, but does **not** neutralize cells beginning with `=`, `+`, `-`, `@`, tab, or
  CR. Several exported columns (`Actor`, `Before/After/Metadata JSON`) carry attacker-
  influenced data — e.g. the public enquiry route stores `actor: user?.email ?? "consultant"`
  and writes customer-supplied names into `meta_json`. When a manager/admin opens the
  exported CSV in Excel or Google Sheets, a value such as `=HYPERLINK(...)` or a DDE payload
  executes, enabling data exfiltration or command execution on the reviewer's machine.
- **Affected area:** `lib/export-audit.ts` (`csvCell`, `exportAuditToCsv`); reached via
  `app/api/audit/export/route.ts`.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium** — requires a privileged user
  to export and open the file in a spreadsheet app, but the injected data path is reachable
  by unauthenticated users via the public enquiry endpoint.
- **Effort estimate:** **Low** — prefix risky leading characters with `'` (or space) inside
  `csvCell`.
- **Cost implication:** **Low**
- **Scope of fix:** Localised (single helper).
- **Recommended fix:** In `csvCell`, when the stringified value's first character is one of
  `= + - @ \t \r`, prepend a single quote (`'`) before quoting, so spreadsheet apps treat the
  cell as text.

---

### Finding 5 — `lodash` code injection & prototype pollution (transitive via `recharts`)
- **Description:** `pnpm audit` reports `lodash` (resolved through `recharts > lodash`)
  vulnerable to **Code Injection via `_.template`** (`GHSA-r5fr-rjxr-66jc`, high) and
  **Prototype Pollution** (`GHSA-f23m-r3pf-42rh`, moderate), both fixed in `>=4.18.0`. The
  app does not appear to call `_.template` directly, so practical exposure is limited to
  whatever `recharts` does internally, but the vulnerable code ships in the bundle.
- **Affected area:** Transitive dependency of `recharts` (charting in dashboards/reporting).
- **Likelihood / Impact / Risk:** Low / Medium / **Low-Medium**
- **Effort estimate:** **Medium** — upgrade `recharts` to a release that pulls a patched
  lodash, or add a `pnpm.overrides` entry forcing `lodash >=4.18.0` and verify charts render.
- **Cost implication:** **Low-Medium**
- **Scope of fix:** Localised (dependency graph), with chart-rendering verification.
- **Recommended fix:** Add `"pnpm": { "overrides": { "lodash": ">=4.18.0" } }` to
  `package.json` (or bump `recharts`), reinstall, and confirm reporting charts still render.

---

### Finding 6 — Credential encryption key derived from raw SHA-256 (no KDF/salt)
- **Description:** `lib/inbound-email/crypto.ts` derives the AES-256-GCM key via
  `createHash("sha256").update(EMAIL_CREDENTIAL_ENCRYPTION_KEY).digest()`. The AEAD
  construction itself is correct (random 12-byte IV, auth tag, versioned `v1` envelope). The
  caveat: SHA-256 is not a password-based KDF, so if the env var is ever set to a low-entropy
  passphrase rather than a high-entropy random key, the derived key is weak. There is also no
  key-rotation path beyond the static `v1` version tag.
- **Affected area:** `lib/inbound-email/crypto.ts`; backs `salesperson_credentials.encrypted_password`
  and inbound-email account secrets.
- **Likelihood / Impact / Risk:** Low / Medium / **Low** — depends on operational key
  hygiene; the at-rest scheme is otherwise sound and the column is never returned to clients.
- **Effort estimate:** **Low-Medium**
- **Cost implication:** **Low**
- **Scope of fix:** Localised.
- **Recommended fix:** Document/enforce that `EMAIL_CREDENTIAL_ENCRYPTION_KEY` is a 32-byte
  random value (e.g. `openssl rand -base64 32`); optionally validate key length at startup
  and design a key-version rotation path (the `v1:` envelope already leaves room for this).

---

### Finding 7 — PostCSS `<8.5.10` XSS advisory (build-time)
- **Description:** `pnpm audit` flags `postcss` for **XSS via unescaped `</style>`**
  (`GHSA-qx2v-qp2m-jg93`, moderate, fixed in `>=8.5.10`). PostCSS runs at build time over the
  project's own (trusted) CSS, so runtime exploitability is minimal, but the toolchain should
  still be current.
- **Affected area:** `postcss` build dependency (`devDependencies`).
- **Likelihood / Impact / Risk:** Low / Low / **Low**
- **Effort estimate:** **Low** — bump `postcss` to `>=8.5.10`.
- **Cost implication:** **Low**
- **Scope of fix:** Localised.
- **Recommended fix:** `pnpm add -D postcss@latest`, regenerate the lockfile, rebuild.

---

## 4. Priority Actions

Ordered by **highest risk vs. lowest effort** (best wins first):

1. **Upgrade Next.js to `>=16.2.6`** (Finding 1) — *High risk, Low effort.* Clears 9 high +
   13 moderate advisories in a single dependency bump. **Do this first.**
2. **Lock down the public `/api/enquiries` POST** (Finding 2) — *High risk, Medium effort.*
   Add a strict Zod schema (with length/array caps) and rate limiting / bot protection before
   any DB writes.
3. **Add HTTP security headers** (Finding 3) — *Medium risk, Low effort.* One `headers()`
   block in `next.config.mjs` delivers app-wide defense-in-depth.
4. **Neutralize CSV formula injection** (Finding 4) — *Medium risk, Low effort.* One-line
   guard in `csvCell()`.
5. **Override/upgrade `lodash` and bump `postcss`** (Findings 5, 7) — *Low-Medium / Low risk,
   Low-Medium effort.* Resolve via `pnpm.overrides` and a dev-dependency bump.
6. **Harden credential-key guidance** (Finding 6) — *Low risk.* Enforce a high-entropy key
   and document a rotation path.

---

*Report generated by an automated security review pass. Re-run `pnpm audit --prod` after any
dependency change to confirm advisory counts.*
