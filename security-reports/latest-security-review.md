# Security Review — Luxus Sales System

| Field | Value |
|---|---|
| **Repository** | `hawkcoding/v0-luxu-sales-system` |
| **Branch reviewed** | `claude/friendly-curie-gJZFV` |
| **Run date** | 2026-05-27 |
| **Overall security posture** | **Moderate** |
| **Highest-risk issue** | Outdated Next.js (16.1.6) with multiple High-severity CVEs incl. proxy/middleware auth bypass + SSRF |
| **Lowest-risk issue** | Non-constant-time cron secret comparison (theoretical timing leak) |
| **Total findings** | 9 |

> Fresh scan. No application code was modified. Findings are tied to specific files/lines in the current repository state.

---

## 1. Summary

- **Total vulnerabilities:** 9 (grouping 25 advisory entries from `pnpm audit` into one dependency finding).
- **Highest-risk issue:** *Outdated Next.js* — version `16.1.6` is affected by 9 High and several Moderate advisories, including App-Router **middleware/proxy bypass** (the app ships a `proxy.ts` session gate), **SSRF**, HTTP request smuggling, cache poisoning, and Server-Component DoS. Trivially fingerprinted and exploited by automated scanners.
- **Lowest-risk issue:** *Non-constant-time cron secret comparison* — requires a high volume of requests against a high-entropy secret to leak anything; practically infeasible.
- **Posture:** **Moderate.** Authentication/authorization helpers are consistent and RLS-aware, credentials are encrypted with AES-256-GCM, cron routes are token-gated, and the dev replay route is production-blocked. The posture is pulled down by an out-of-date framework with known CVEs and one public, unauthenticated, unvalidated intake endpoint that bypasses RLS.

---

## 2. Risk Matrix

| # | Issue | Likelihood | Impact | Risk Level |
|---|---|---|---|---|
| 1 | Outdated Next.js with multiple High CVEs (proxy bypass, SSRF, DoS) | High | High | **High** |
| 2 | Public `/api/enquiries` POST: no auth, no Zod, RLS-bypass, no rate limit | High | Medium–High | **High** |
| 3 | Missing HTTP security headers / CSP | Medium | Medium | **Medium** |
| 4 | Stored XSS via email-template HTML preview (`dangerouslySetInnerHTML`) | Low–Medium | Medium | **Medium** |
| 5 | Vulnerable transitive deps (lodash, postcss, ws) | Low | Medium | **Medium** |
| 6 | Weak password policy (min length 6, no complexity) | Low–Medium | Medium | **Low–Medium** |
| 7 | File-upload type check trusts client `Content-Type` | Low | Low–Medium | **Low** |
| 8 | Real Supabase project refs committed in example env file | Low | Low | **Low** |
| 9 | Non-constant-time cron secret comparison | Low | Low | **Low** |

**Ranked most → least severe:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

---

## 3. Detailed Findings

### Finding 1 — Outdated Next.js with multiple High-severity CVEs
- **Description:** `package.json` pins `next@16.1.6`. `pnpm audit --prod` reports 25 advisories, the majority against Next.js, fixed in `>=16.2.6`. Notable items:
  - `GHSA-26hh-7cqf-hhc6`, `GHSA-492v-c6pp-mqqv`, `GHSA-267c-6grr-h53f`, `GHSA-36qx-fr4f-26g5` — **Middleware / Proxy bypass** in App/Pages router. The app relies on `proxy.ts` for session handling, so auth-gate bypass is directly relevant.
  - `GHSA-c4j6-fc7j-m34r` — **Server-Side Request Forgery**.
  - `GHSA-ggv3-7p47-pfv8` — HTTP request smuggling in rewrites.
  - `GHSA-q4gf-8mx6-v5v3`, `GHSA-8h8q-6873-q5fj`, `GHSA-mg66-mrh9-m8jx`, `GHSA-h64f-5h5j-jqjh` — DoS (Server Components / connection exhaustion / image).
  - `GHSA-wfc6-r584-vfw7` — cache poisoning; `GHSA-ffhc-5mcf-pf4q`, `GHSA-gx5p-jg67-6x7h` — XSS; `GHSA-mq59-m269-xvcx` — Server Actions CSRF via null origin.
- **Affected area:** `package.json` (`next` dependency); framework-wide; `proxy.ts` session gate.
- **Likelihood / Impact / Risk:** High / High / **High**
- **Effort estimate:** Low — bump `next` to `>=16.2.6`, run `pnpm install`, `pnpm typecheck`, `pnpm test`, smoke-test the app.
- **Cost implication:** Low.
- **Scope of fix:** Localised (dependency + regression test), but framework-wide blast radius.
- **Recommended fix:** `pnpm add next@latest` (>= 16.2.6), regenerate `pnpm-lock.yaml`, verify build/tests, redeploy. Add Dependabot/Renovate to keep the framework patched.

### Finding 2 — Public `/api/enquiries` POST: unauthenticated, no Zod validation, RLS bypass, no rate limiting
- **Description:** `app/api/enquiries/route.ts:410` `POST` is intentionally public (web form + paste import) and uses `createServiceClient()` (`:415`), which **bypasses RLS**. The body is consumed via `await req.json()` (`:411`) and fields are read directly with loose typing — `body.email`, `body.travellers` typed `any[]` (`:572`), `body.childTravellers` (`:573`) — with **no Zod schema**, no length/shape limits, and **no rate limiting / CAPTCHA**. It writes to `customers`, `bookings`, `booking_suites`, `travellers` (PII: `id_passport`, `date_of_birth`), `booking_transport_requests`, and `quotes`. This violates the project rule "Validate all external input at API boundaries with Zod." Consequences: unauthenticated data flooding / spam record creation, oversized/malformed payload abuse, PII injection, and storage of script payloads in free-text fields (feeds Finding 4).
- **Affected area:** `app/api/enquiries/route.ts` (`POST`, lines 410–702).
- **Likelihood / Impact / Risk:** High / Medium–High / **High**
- **Effort estimate:** Medium — define a strict Zod schema for the full payload (incl. travellers/transport arrays with bounded array lengths and field caps), reject on parse failure with `400`, and add rate limiting (IP-based or Vercel/Upstash) + a bot check.
- **Cost implication:** Low–Medium.
- **Scope of fix:** Localised to the route, with a shared validation/limit helper that other public surfaces can reuse.
- **Recommended fix:** Wrap the handler in `schema.safeParse(body)`; cap array sizes and string lengths; add per-IP rate limiting and a CAPTCHA/honeypot on the public form; keep the service client but only after validation.

### Finding 3 — Missing HTTP security headers / Content-Security-Policy
- **Description:** `next.config.mjs` defines no `headers()` — there is no CSP, `Strict-Transport-Security`, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy`. Next.js does not add these by default. Without a CSP the app has no defence-in-depth against the XSS sink in Finding 4, and without frame protections it is open to clickjacking.
- **Affected area:** `next.config.mjs`.
- **Likelihood / Impact / Risk:** Medium / Medium / **Medium**
- **Effort estimate:** Low — add an `async headers()` block (or middleware) with the standard header set; tune CSP to allowed origins (Supabase, Vercel Analytics, Resend).
- **Cost implication:** Low.
- **Scope of fix:** Localised (single config file), affects all responses.
- **Recommended fix:** Add `Content-Security-Policy` (start in report-only), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`.

### Finding 4 — Stored XSS via email-template HTML preview
- **Description:** `app/app/templates/page.tsx:185` renders `preview?.bodyHtml` through `dangerouslySetInnerHTML` with no sanitization. Template bodies legitimately contain HTML and embed placeholders that are replaced with live data (e.g. customer name). Because the public intake (Finding 2) does not validate/sanitize free-text fields, attacker-controlled values can reach the template, and the preview (and likely the rendered outbound email) executes them. Exploitation is gated by who can trigger the preview/edit (managers/admins), so likelihood is moderate, but the impact is session/account compromise of privileged users.
- **Affected area:** `app/app/templates/page.tsx:185`; template placeholder substitution; data source from Finding 2. (`components/ui/chart.tsx:83` also uses `dangerouslySetInnerHTML` but only for controlled chart CSS — low concern.)
- **Likelihood / Impact / Risk:** Low–Medium / Medium / **Medium**
- **Effort estimate:** Medium — sanitize HTML before render (e.g. DOMPurify) and/or escape placeholder values at substitution time; pair with the CSP from Finding 3.
- **Cost implication:** Low–Medium.
- **Scope of fix:** Cross-cutting (preview component + placeholder substitution + any email render path).
- **Recommended fix:** HTML-escape interpolated placeholder values; sanitize the final HTML with an allow-list sanitizer before `dangerouslySetInnerHTML`; rely on CSP as backstop.

### Finding 5 — Vulnerable transitive dependencies (lodash, postcss, ws)
- **Description:** From `pnpm audit --prod`:
  - **lodash** `<=4.17.23` via `recharts>lodash` — Code Injection via `_.template` (`GHSA-r5fr-rjxr-66jc`, High) and Prototype Pollution (`GHSA-f23m-r3pf-42rh`, Moderate). App is unlikely to call `_.template` directly, but the vulnerable code ships in the bundle/transitive tree.
  - **postcss** `<8.5.10` via `autoprefixer>postcss` — XSS via unescaped `</style>` (`GHSA-qx2v-qp2m-jg93`, Moderate). Build-time tooling.
  - **ws** `>=8.0.0 <8.20.1` via `@supabase/supabase-js>@supabase/realtime-js>ws` — uninitialized memory disclosure (`GHSA-vfv6-92ff-j949`/`GHSA-3h5v-q93c-6h6q`, Moderate).
- **Affected area:** `pnpm-lock.yaml` transitive tree (`recharts`, `autoprefixer`, `@supabase/supabase-js`).
- **Likelihood / Impact / Risk:** Low / Medium / **Medium**
- **Effort estimate:** Medium — update parents (`recharts`, `autoprefixer`/`@supabase/supabase-js`) or add `pnpm.overrides` to force patched versions (`lodash>=4.18.0` is not published — pin recharts to a release that drops lodash, or override to a maintained fork; `postcss>=8.5.10`; `ws>=8.20.1`).
- **Cost implication:** Low–Medium.
- **Scope of fix:** Localised (lockfile / overrides), needs regression testing of charts and realtime.
- **Recommended fix:** Add `pnpm.overrides` for `postcss` and `ws`; upgrade `recharts` to a version without vulnerable lodash, or override lodash. Re-run `pnpm audit` to confirm.

### Finding 6 — Weak password policy on admin password reset
- **Description:** `app/api/users/[userId]/password/route.ts:59` enforces only `newPassword.length >= 6` with no complexity, breach-list, or length-recommended (≥12) check. Admin-only, but a weak password set here weakens every downstream auth path.
- **Affected area:** `app/api/users/[userId]/password/route.ts:58-64`; also Supabase auth password settings.
- **Likelihood / Impact / Risk:** Low–Medium / Medium / **Low–Medium**
- **Effort estimate:** Low — raise minimum length (≥12), add a Zod refine, and enable Supabase's leaked-password protection.
- **Cost implication:** Low.
- **Scope of fix:** Localised; mirror the rule on any self-service password flow.
- **Recommended fix:** Increase minimum to 12, reject common/breached passwords, validate with Zod, and turn on Supabase "leaked password protection".

### Finding 7 — File-upload type check trusts client-supplied `Content-Type`
- **Description:** `app/api/documents/upload/route.ts:69` validates `file.type` against an allow-list, but `file.type` is the browser-declared MIME and is spoofable. There is no magic-byte/content sniffing, so a disguised file can be stored and later served via signed URL with the attacker-chosen content type. Size limit, UUID path, filename sanitisation, and ownership checks are otherwise good.
- **Affected area:** `app/api/documents/upload/route.ts:53-91`.
- **Likelihood / Impact / Risk:** Low / Low–Medium / **Low**
- **Effort estimate:** Low–Medium — verify magic bytes (e.g. `file-type`) against the declared type before upload; ensure storage responses set `Content-Disposition: attachment` / `nosniff`.
- **Cost implication:** Low.
- **Scope of fix:** Localised.
- **Recommended fix:** Sniff the buffer's real type and require it to match the allow-list; serve downloads with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.

### Finding 8 — Real Supabase project refs committed in example env file
- **Description:** `.env.sync.local.example` contains real project refs — `SUPABASE_DEV_PROJECT_REF=isxpuhttwzyvjclrnhbg` and `SUPABASE_PROD_PROJECT_REF=qlwldfhjfbxliyjvoziu`. No secrets are leaked (passwords are blank, and the dev ref is also exposed via `NEXT_PUBLIC_SUPABASE_URL`), but committing the **production** ref in the repo aids targeting/reconnaissance.
- **Affected area:** `.env.sync.local.example`.
- **Likelihood / Impact / Risk:** Low / Low / **Low**
- **Effort estimate:** Low — replace with placeholders.
- **Cost implication:** Low.
- **Scope of fix:** Localised (one file).
- **Recommended fix:** Replace real refs with `<dev-project-ref>` / `<prod-project-ref>` placeholders; ensure pooler DB passwords are never committed.

### Finding 9 — Non-constant-time cron secret comparison
- **Description:** The cron routes (`app/api/cron/email-sync/route.ts:7`, `app/api/cron/payment-reminders/route.ts:8`, `app/api/cron/pipeline-auto-close/route.ts:42`) compare the bearer token with `authHeader !== \`Bearer ${process.env.CRON_SECRET}\``, a non-constant-time comparison (theoretical timing side-channel). They do correctly require a non-empty `CRON_SECRET`.
- **Affected area:** the three `app/api/cron/*` routes.
- **Likelihood / Impact / Risk:** Low / Low / **Low**
- **Effort estimate:** Low — use `crypto.timingSafeEqual` on equal-length buffers via a shared helper.
- **Cost implication:** Low.
- **Scope of fix:** Localised (shared helper used by 3 routes).
- **Recommended fix:** Extract a `verifyCronAuth(request)` helper using `timingSafeEqual`; reuse across all cron routes.

---

## 4. Priority Actions

**Do first (highest risk vs. lowest effort):**
1. **Upgrade Next.js to `>=16.2.6`** (Finding 1) — Low effort, removes 9 High + several Moderate CVEs including proxy/auth bypass and SSRF. Biggest single risk reduction available.
2. **Add Zod validation + rate limiting to `/api/enquiries` POST** (Finding 2) — closes the main unauthenticated, RLS-bypassing write surface and the data path that feeds the XSS sink.
3. **Add security headers + CSP in `next.config.mjs`** (Finding 3) — Low effort, app-wide defence-in-depth and the backstop for Finding 4.

**Next:**
4. Sanitize/escape email-template HTML before render (Finding 4).
5. Override/upgrade vulnerable transitive deps and re-run `pnpm audit` (Finding 5).
6. Strengthen the password policy and enable leaked-password protection (Finding 6).

**Quick low-risk hardening wins:**
7. Magic-byte validation on uploads (Finding 7).
8. Replace real project refs in the example env file (Finding 8).
9. Constant-time cron secret comparison (Finding 9).

---
*Generated by an automated security review. Verify each finding against current code before acting; no application code was modified by this run.*
