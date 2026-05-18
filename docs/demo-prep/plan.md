# Luxus Sales System — 48-Hour Demo Readiness Plan (Phased)

## Context

We are demoing the Luxus Sales System to a new client in **48 hours**.

**Where we stand (verified):**
- Current local branch `claude/demo-readiness-checklist-8LH7G` is in sync with `origin/dev` at commit `1227526` — working tree is clean, nothing unpushed.
- **`origin/dev` already contains the work** described by the 12 open PRs (#55–#67). Codex-sync style merges (e.g. `e61aa9f` "Implement email, invoices, vouchers, and workflow updates", `6a5da09` "stabilize booking workflow automation", `8fe8119` "Add voucher template management") have brought the substantive changes into `dev`. The 12 open PRs are therefore mostly stale branches: 11 mistargeted at `main`, all CI-red.
- One more PR is being pushed by the user shortly — it must be incorporated.
- Email intake is wired: `lib/inbound-email/sync.ts` (IMAP via ImapFlow), `app/api/cron/email-sync/route.ts`, `lib/inbound-email/import-booking.ts`, UI at `components/inbound-email-settings.tsx`. IMAP → auto-create enquiry is the golden demo path.
- Demo runs **locally** via `pnpm dev` on a laptop, email/PDF in **dry-run** mode.

**What this plan delivers:** A phase-by-phase track that (a) gets every open PR cleanly resolved on GitHub (green-or-closed-as-superseded with a clear reason), (b) makes the email-intake → workflow path bulletproof, (c) seeds populated data so screens look alive, (d) sets up an automated QA smoke test, then iterates on its feedback, and (e) ends in a rehearsed demo runbook.

**Demo scope** (per user): showcase **how the client will USE the system**. The single must-work flow is:

> **Email arrives → enquiry auto-created → quote built & sent → accepted → deposit invoice → deposit paid → booking confirmed → final invoice → final payment → voucher PDF → closed.**

We will **not** demo creating suppliers or packages — those screens are walked past briefly, not built from scratch.

---

## How to use this plan

Each phase is self-contained: clear **objective**, **steps**, **critical files**, and **exit criteria**. Phases run sequentially unless marked otherwise. A phase can be handed verbatim to a sub-agent as a prompt — the phase blocks below are written so they read as standalone instructions.

The plan covers ~11 phases; expect Phase 1–5 to consume Day 1, Phase 6–8 the morning of Day 2, Phase 9–10 the afternoon, Phase 11 demo morning.

---

## Phase 0 — Truth-up the baseline (read-only, ~30 min)

**Objective:** Build a precise inventory of every open PR vs the state of `origin/dev` so later phases know exactly what to do with each.

**Steps:**
1. `git fetch origin --prune` and re-confirm: `git status`, `git log --oneline -30 origin/dev`.
2. For each PR in {#55, #56, #57, #58, #59, #60, #61, #62, #63, #64, #65, #66 (already merged), #67}:
   - Use `mcp__github__pull_request_read` to capture: `title`, `base.ref`, `head.ref`, `head.sha`, `mergeable`, `state`, CI summary, list of files changed.
   - Diff each PR's changed files against `origin/dev` to determine overlap.
3. Categorise every PR into one of:
   - **(A) Superseded** — every change is already in `dev` (or a functionally equivalent version is). → will be closed in Phase 5.
   - **(B) Mistargeted, partially new** — most changes are in `dev`, but the PR adds genuinely net-new code worth keeping. → rebase onto `dev` in Phase 3.
   - **(C) Net-new** — material work not yet in `dev`. → rebase onto `dev`, fix CI, merge in Phase 3–4.
   - **(D) Dangerous** — known to break things (PR #65 migration). → close with explanation in Phase 5.
4. Write the inventory into `docs/demo-prep/pr-triage.md` (working notes file — not pushed to client; safe to commit to feature branch). Columns: `PR # | Title | base | head SHA | category | overlap notes | action`.

**Critical files to reference (do not edit in this phase):**
- `lib/inbound-email/sync.ts`, `lib/inbound-email/import-booking.ts`
- `app/api/invoices/deposit/route.ts`, `app/api/invoices/final/route.ts`
- `lib/voucher/render-pdf.ts`, `lib/generate-voucher.ts`
- `supabase/migrations/` (especially 2026-05 dated files)

**Exit criteria:**
- `docs/demo-prep/pr-triage.md` exists with one row per open PR and a clear category.
- Every PR has a planned action recorded.

---

## Phase 1 — Capture local state & ingest the incoming PR

**Objective:** Make sure nothing local is lost and the user's about-to-be-pushed PR is on our radar.

**Steps:**
1. Re-confirm `git status` is clean. If anything is uncommitted (untracked migrations, scratch files), decide per-file: commit to the feature branch, stash, or delete. **Do not** discard without checking with the user.
2. Push the current `claude/demo-readiness-checklist-8LH7G` branch to origin if it has drifted: `git push -u origin HEAD`.
3. Wait for the user to confirm the incoming PR has been pushed, then `git fetch origin --prune` and add it to the Phase 0 inventory with the same triage logic.
4. If the incoming PR introduces a migration, schema change, or new env var, flag it loud at the top of `docs/demo-prep/pr-triage.md` — it will likely become a Phase 4 dependency.

**Exit criteria:**
- Working tree clean, nothing unpushed.
- Incoming PR triaged and added to the inventory.

---

## Phase 2 — Re-target every mistargeted PR (`main` → `dev`)

**Objective:** Get all open PRs aiming at the right base branch per `CLAUDE.md` (feature → `dev`). This is a quick, low-risk hygiene pass; no code changes yet.

**Steps:**
1. For each PR currently based on `main` (everything except #67 and possibly #66), call `mcp__github__update_pull_request` with `base: "dev"`.
2. GitHub will recompute the diff — many PRs that looked huge against `main` will collapse to a small or empty diff against `dev`. **That signal alone usually proves category (A) superseded.**
3. Update `docs/demo-prep/pr-triage.md` with the new diff size and refine categories.

**Exit criteria:**
- Every open PR's `base.ref` is `dev`.
- Triage doc updated with post-rebase diff sizes.

---

## Phase 3 — Rebase & resolve conflicts on retained PRs (categories B/C)

**Objective:** For each PR worth keeping, get its branch on top of `dev` cleanly so CI can run from a known base.

**Steps (per PR, in dependency order):**
1. Locally: `git fetch origin && git checkout <pr-head-branch>`.
2. `git rebase origin/dev`.
3. Resolve conflicts. Expected hotspots based on the codebase:
   - `lib/inbound-email/*` (sync + import logic)
   - `app/api/invoices/deposit/route.ts`, `app/api/invoices/final/route.ts`
   - `app/api/voucher/generate/route.ts`, `lib/voucher/render-pdf.ts`
   - `supabase/migrations/*`
   - `lib/version.ts` (always conflicts on bumps — keep `dev`'s value)
4. **For migration conflicts:** prefer dropping the PR's migration if `dev` already has an equivalent one (look at file timestamps + table targets). Never apply two migrations that modify the same table for the same purpose.
5. `pnpm install && pnpm typecheck && pnpm lint && pnpm test` locally; fix what breaks.
6. `git push --force-with-lease origin <pr-head-branch>`. **Never** `--force` — must be `--force-with-lease` to protect against concurrent updates.

**Order of attack:** start with PR #55 (the prerequisite for ~10 others), then walk the dependency chain. Use the triage doc.

**Special-case:** PR #65 (booking_number migration) — do not rebase; route to Phase 5 close.

**Exit criteria:**
- Every retained PR rebased onto `dev`, force-with-leased to origin.
- Local `pnpm test` passes on each retained branch.

---

## Phase 4 — Drive CI to green on every retained PR

**Objective:** Each retained PR goes green on GitHub Actions / Vercel.

**Steps:**
1. For each retained PR, wait for the post-push CI run. Use `mcp__github__pull_request_read` to fetch CI state.
2. Triage failures in this order: typecheck → lint → unit tests → build.
3. Address review comments left on the PRs (e.g. the 2 P2s noted on PR #67) — squash fixes into the PR.
4. Re-push and re-check. Repeat until green.
5. Merge each green PR into `dev` via squash-merge (preferred for clean dev history). Use `mcp__github__merge_pull_request` with `merge_method: "squash"`.
6. After each merge, pull `dev` locally (`git fetch origin && git checkout dev && git pull --ff-only`) so the next rebase target stays current.

**Exit criteria:**
- All retained PRs merged into `dev`.
- `dev` CI green.
- Demo-readiness branch rebased on the new `dev` HEAD.

---

## Phase 5 — Close superseded & dangerous PRs with explanation

**Objective:** No open PRs left lingering.

**Steps:**
1. For each category-A and category-D PR, post a closing comment via `mcp__github__add_issue_comment` referencing the `dev` commit that supersedes it (or, for #65, explain the breakage and link to the equivalent safe migration already in `dev`). Then close via `mcp__github__pull_request_write` (state `closed`).
2. Sample comment template:
   > Closing as superseded — this work is already on `dev` via `<commit-sha>` ("<commit subject>"). Reopen if you spot a divergence we missed.

**Exit criteria:**
- Open-PR count for the repo = 0 (or only the demo-readiness branch's own PR if one exists).
- Every closed PR has an explanatory comment.

---

## Phase 6 — Seed demo data centered on the email-intake flow

**Objective:** Make the system look alive on first load, and stage one bookable email fixture for the live demo.

**Steps:**
1. Extend `supabase/seed.sql` (or add `supabase/seeds/demo.sql`) with:
   - **4 customers** (mix SA + international names, realistic emails/phones)
   - **2 suppliers**: Rovos Rail, Blue Train (with sample contact + 1 base price each)
   - **2 packages**: Pretoria→Cape Town train; Cape Town hotel add-on
   - **6 bookings** spread across pipeline stages so Kanban is populated:
     - 1 `enquiry`, 1 `quote_sent` (with a quote record), 1 `accepted`, 1 `deposit_paid` (with deposit invoice + recorded payment), 1 `final_paid` (no voucher yet — held as backup demo subject), 1 `voucher_sent`
2. Create `supabase/seeds/inbound-email-fixtures/new-enquiry.json` — a realistic enquiry email payload matching what `lib/inbound-email/sync.ts` produces after `mailparser`. Fields: `from`, `to`, `subject` (matching the seeded inbound rule), `text`, `html`, `date`.
3. Add one **inbound-email rule** to the seed so the fixture matches automatically (subject contains "New enquiry from website" or similar).
4. Run `pnpm db:reset` and verify dashboard/pipeline/customers/suppliers/jobs all populate.
5. Add a dev-only API route `app/api/dev/replay-inbound-email/route.ts`, guarded by `if (process.env.NODE_ENV === 'production') return 404`. It reads a fixture from `supabase/seeds/inbound-email-fixtures/`, runs it through `createEmailBookingFromParsedDraft` from `lib/inbound-email/import-booking.ts`, and returns the created job ID. This is our **demo trigger** for the email-arrival moment — we don't have to depend on a live IMAP fetch during the demo.

**Critical files:**
- `supabase/seed.sql` (extend)
- `lib/inbound-email/import-booking.ts` (reuse `createEmailBookingFromParsedDraft`)
- `lib/inbound-email/sync.ts` (reference the parsed-email shape)
- `app/api/dev/replay-inbound-email/route.ts` (new)

**Exit criteria:**
- `pnpm db:reset` produces a populated UI with 6 bookings across ≥4 stages.
- Hitting `POST /api/dev/replay-inbound-email` creates a new `enquiry` row visible in the pipeline.

---

## Phase 7 — Lock outbound email & PDFs into dry-run mode

**Objective:** Quote/invoice/voucher actions must succeed end-to-end without sending real mail, but PDFs still render visibly.

**Steps:**
1. Audit every Resend send call site:
   - `lib/quotes/render-quote-email.ts`
   - `lib/invoices/render-invoice-email.ts`
   - `lib/voucher/render-voucher-email.ts`
   - and any `resend.emails.send` usage in `app/api/**`.
2. Confirm behaviour when `RESEND_API_KEY` is unset. If any call throws, wrap it in:
   ```ts
   if (!process.env.RESEND_API_KEY) {
     console.log("[dry-run] would have sent:", { to, subject });
     return { ok: true, dry_run: true };
   }
   ```
3. Ensure PDF rendering (voucher + invoices via react-pdf) still writes the file to Supabase storage in dry-run — that's the visible artefact in the demo.
4. **Quote PDF gap:** the codebase renders quotes as HTML email only. For 48h, skip building a quote PDF; the demo shows the rendered quote-email preview on screen instead. Note in the runbook that "Download PDF" on quotes is hidden.
5. Add a small banner in dev: `Demo mode — emails not sent` near the top of `/app/app` layout when `RESEND_API_KEY` is unset, so the operator never wonders.

**Critical files:**
- `lib/quotes/render-quote-email.ts`
- `lib/invoices/render-invoice-email.ts`
- `lib/voucher/render-voucher-email.ts`
- `app/app/layout.tsx` (banner)

**Exit criteria:**
- "Send Quote", "Send Deposit Invoice", "Send Final Invoice", "Generate Voucher" all complete with `dry_run: true` and no thrown errors.
- Voucher and invoice PDFs visibly render and open from the UI.

---

## Phase 8 — Automated QA smoke test

**Objective:** A single command that exercises the full email-to-voucher path and reports pass/fail per step. We run it, fix what breaks in Phase 9, run again.

**Steps:**
1. Create `scripts/qa-smoke.ts` (executable via `pnpm qa:smoke`, with a new `package.json` script):
   - Boots assumes `pnpm dev` is already running on `http://localhost:3000`.
   - Logs in via Supabase auth as `dirk@luxustravel.co.za`, captures cookies.
   - `POST /api/dev/replay-inbound-email` with the `new-enquiry.json` fixture → expect 200, capture `job_id`.
   - Polls `GET /api/jobs/:id` until stage = `enquiry`.
   - Creates a quote: `POST /api/quotes` (2 line items, adult + child prices). Asserts 200.
   - Sends the quote: `POST /api/quotes/:id/send`. Asserts dry-run.
   - Accepts quote: stage transition via `POST /api/jobs/:id/transition`. Asserts stage = `accepted`.
   - Generates deposit invoice: `POST /api/invoices/deposit`. Asserts PDF URL returned.
   - Records deposit payment: `POST /api/payments`. Asserts `deposit_paid = true`, stage advances.
   - Generates final invoice: `POST /api/invoices/final`. Asserts PDF.
   - Records final payment. Asserts `invoice_balance = 0`.
   - Generates voucher: `POST /api/voucher/generate`. Asserts PDF URL.
   - Closes job. Asserts stage = `closed`.
   - Writes a JSON report to `qa-reports/<timestamp>.json` with per-step `{ step, status, durationMs, error? }`.
2. Add to `package.json`: `"qa:smoke": "tsx scripts/qa-smoke.ts"`.
3. (Stretch — only if Phase 1–7 finished ahead of schedule) wrap the same flow in Playwright `tests/qa-smoke.spec.ts` to drive the UI rather than the API. Otherwise stick with the API-level pass — it's the highest-value coverage for the time.

**Critical files:**
- `scripts/qa-smoke.ts` (new)
- `package.json` (script entry)
- `qa-reports/` (gitignored)

**Exit criteria:**
- `pnpm qa:smoke` runs to completion against a freshly-reset DB and emits a JSON report.

---

## Phase 9 — Iterate on QA feedback

**Objective:** Drive `pnpm qa:smoke` to all-green.

**Steps:**
1. Run `pnpm qa:smoke`. For each failing step:
   - Read the error from the JSON report.
   - Inspect the API route at the failing step (e.g. `app/api/invoices/deposit/route.ts`).
   - Fix the bug or test-fixture mismatch.
   - Re-run.
2. Common likely failures:
   - Auth cookie not set correctly → fix Supabase signin call in `scripts/qa-smoke.ts`.
   - Zod validation rejects fixture payload → align fixture to schema in `app/api/quotes/route.ts` etc.
   - Stage transition forbidden by `validate-stage-move/route.ts` → check pipeline constants in `lib/pipeline/constants.ts`.
3. Stop when **3 consecutive runs pass** end-to-end on a fresh DB.

**Critical files:** whichever the QA pass surfaces. Likely candidates:
- `app/api/jobs/[id]/validate-stage-move/route.ts`
- `lib/pipeline/constants.ts`
- `app/api/quotes/route.ts`, `app/api/payments/route.ts`

**Exit criteria:**
- `pnpm qa:smoke` green 3× in a row from `pnpm db:reset`.
- All fixes committed to `dev` and pushed.

---

## Phase 10 — Final polish + manual rehearsal

**Objective:** Two timed end-to-end dry runs on the demo laptop, on the demo network, at the same time of day as the demo.

**Steps:**
1. **Hide what we won't show:** in `components/app-nav.tsx` (or equivalent), hide or flag the Inbound Email settings tab, the Reporting drill-downs, and any "Download Quote PDF" affordance. Do this with a simple env-flag `NEXT_PUBLIC_DEMO_HIDE=inbound-email,quote-pdf` or a hardcoded list — minimum viable, not future-proof.
2. **Version bump:** `pnpm app:version:bump` once at the end of all code changes — bumps `APP_VERSION` from `2.58` to `2.59`. Confirm the dashboard shows the new version.
3. **Two timed dry runs** of the runbook below. Note any rough edges. Fix them.

**Runbook (target 12–15 minutes):**
1. Login as `dirk@luxustravel.co.za` (manager view).
2. Dashboard tour — upcoming follow-ups, KPIs.
3. Pipeline Kanban — point at 6 staged bookings.
4. **The big moment**: trigger `POST /api/dev/replay-inbound-email` from a terminal alongside the browser. New enquiry pops in pipeline.
5. Open the new enquiry — show how the email body became structured data.
6. Build a quote — 2 line items with adult/child prices.
7. Send quote — show dry-run banner + email preview.
8. Accept quote (stage transition).
9. Generate deposit invoice — show the configurable 25% from Settings.
10. Record deposit payment — watch `deposit_paid` flip + stage advance.
11. Generate final invoice → record final payment → balance R0.
12. Generate voucher — open the rendered PDF on screen. *(The visible payoff.)*
13. Audit tab — show the full change log.
14. Close booking.

**Backup plan:** if step 4–8 misbehaves live, switch to the `final_paid` seeded booking and jump to step 12.

**Exit criteria:**
- Two consecutive dry runs without intervention.
- Runbook timings inside the 15-minute envelope.

---

## Phase 11 — Demo-day execution

**Objective:** Land the demo cleanly.

**Pre-demo, T-2 hours:**
- [ ] On the demo laptop: `git pull origin dev && pnpm install && pnpm db:reset && pnpm qa:smoke` — must be green.
- [ ] `pnpm dev` — confirm app loads, dashboard populated, dry-run banner visible.
- [ ] Open the terminal window with the `replay-inbound-email` curl pre-typed but not run.
- [ ] Two browser tabs open: one on `/login`, one on the `final_paid` backup booking detail page.
- [ ] Phone hotspot ready in case demo wifi flakes.

**During demo:** follow the Phase 10 runbook.

**After demo:**
- Don't merge anything new into `dev` until after.
- Capture client feedback in `docs/demo-prep/post-demo-notes.md`.

---

## Cross-cutting policies (apply to all phases)

- **Branching:** every code change rides on a feature branch off `dev`. `git push -u origin HEAD`. Never push to `main` directly.
- **Version:** bump `APP_VERSION` in `lib/version.ts` **once** at the end of Phase 10 — the project rule is one bump per session of code changes.
- **Secrets:** never commit `.env`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Dry-run mode means we can run without them, which is the demo posture.
- **Supabase:** migrations applied locally only via `pnpm db:reset`. Don't touch hosted Supabase unless explicitly asked. Use `IF NOT EXISTS` / `DROP IF EXISTS` for idempotency.
- **Package manager:** `pnpm` only — never `npm install` (breaks Vercel CI).
- **Tests:** every code change runs `pnpm typecheck && pnpm lint && pnpm test` locally before push.

---

## Verification matrix (run before declaring "ready")

| Check | Phase | Command / action | Pass condition |
|---|---|---|---|
| All open PRs resolved | 4–5 | `mcp__github__list_pull_requests state=open` | Count is 0 (or only demo-readiness PR) |
| `dev` CI green | 4 | `mcp__github__pull_request_read` on latest PR into dev | green |
| Local DB seeds | 6 | `pnpm db:reset` | exits 0; UI populated |
| Inbound replay creates enquiry | 6 | `curl -X POST :3000/api/dev/replay-inbound-email` | 200 + new job in pipeline |
| Dry-run sends succeed | 7 | Click "Send Quote", "Generate Deposit Invoice", "Generate Voucher" | All return ok; no thrown errors; PDFs render |
| QA smoke green 3× | 9 | `pnpm qa:smoke` × 3 | All green |
| `APP_VERSION` bumped | 10 | Dashboard footer | shows `2.59` |
| Hidden surfaces hidden | 10 | Visual check | Inbound Email tab, Quote PDF, Reporting drill-downs absent or labelled |
| Dry-run rehearsal × 2 | 10 | Manual | Both ≤ 15 min, no surprises |

---

## Critical files quick-index

- App shell + auth: `app/app/layout.tsx`, `app/login/page.tsx`
- Lifecycle stages + validation: `app/api/jobs/[id]/validate-stage-move/route.ts`, `lib/pipeline/constants.ts`
- Enquiry: `app/app/enquiries/page.tsx`, `app/api/enquiries/route.ts`
- Quote: `app/app/quotes/page.tsx`, `app/api/quotes/route.ts`, `lib/quotes/render-quote-email.ts`
- Deposit invoice: `app/api/invoices/deposit/route.ts`, `lib/invoices/render-invoice-email.ts`
- Final invoice: `app/api/invoices/final/route.ts`
- Voucher: `app/api/voucher/generate/route.ts`, `lib/voucher/render-pdf.ts`, `lib/voucher/pdf/voucher-document.tsx`
- Inbound email: `lib/inbound-email/sync.ts`, `lib/inbound-email/import-booking.ts`, `app/api/cron/email-sync/route.ts`, `components/inbound-email-settings.tsx`
- Settings (deposit %): `app/app/settings/page.tsx`, `app/api/settings/deposit/route.ts`
- Seed: `supabase/seed.sql` (extend here)
- Version: `lib/version.ts`
- New work this plan adds: `app/api/dev/replay-inbound-email/route.ts`, `supabase/seeds/inbound-email-fixtures/new-enquiry.json`, `scripts/qa-smoke.ts`, `docs/demo-prep/pr-triage.md`
