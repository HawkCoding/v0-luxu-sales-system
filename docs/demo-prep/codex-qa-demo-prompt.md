# Codex Prompt — Full Demo-Readiness QA + Demo Route Generator

Hand this entire file to Codex. It is self-contained — Codex should read every
referenced file before starting, then drive the app in a real browser, then emit
the demo route at the end.

---

## Mission

You are the QA agent for the **Luxus Sales System**. Your job has two halves:

1. **Run the existing QA suite** end-to-end in browser, in the documented order,
   capturing every break.
2. **Emit a "Demo Route"** — a concrete, click-by-click walkthrough the operator
   can follow on stage to land the demo without hitting a broken screen. If any
   stage of the canonical workflow is broken, the Demo Route must tell the
   operator the exact workaround (different button, different URL, seeded
   booking to jump to).

The canonical workflow we are trying to demo is:

> **Add customer → start enquiry → build & send quote → accept quote → generate
> deposit invoice → record deposit payment → generate final invoice → record
> final payment → generate voucher PDF → close booking.**

---

## Environment setup (do these first, in order)

1. Confirm Docker Desktop is running. Sanity check: `docker ps` should list
   `supabase_db_luxus-sales-system` healthy. If not, stop and report.
2. From the repo root (`c:\Users\Hancke\Documents\Development\luxus-sales-system`):
   - `pnpm install`
   - `pnpm db:reset` — must finish clean and seed ~18 customers / ~37 bookings.
   - `pnpm dev` in a background terminal. Wait until `http://localhost:3000`
     responds 200 on `/login`.
3. Open a Playwright Chromium browser. Login via the **Quick login** button on
   `/login` (signs in as `carmen@luxustravel.co.za`, manager role).

If any step above fails, stop and write a `BLOCKED` report — do not continue.

---

## Read these before driving the browser

Codex must read (not skim) every file in this list before generating any specs
or clicks. They contain hard-earned conventions you will otherwise re-learn the
expensive way.

- [qa/prompts/00-runbook.md](../../qa/prompts/00-runbook.md) — entrypoint
- [qa/prompts/01-supplier.md](../../qa/prompts/01-supplier.md)
- [qa/prompts/02-package.md](../../qa/prompts/02-package.md)
- [qa/prompts/03-customer.md](../../qa/prompts/03-customer.md)
- [qa/prompts/04-lifecycle.md](../../qa/prompts/04-lifecycle.md) — the most
  important one; covers the full demo workflow
- [qa/prompts/05-gap-analysis.md](../../qa/prompts/05-gap-analysis.md)
- [docs/demo-prep/runbook.md](runbook.md) — the operator's current runbook
- [docs/demo-prep/plan.md](plan.md) — phase plan that produced the QA suite

Also browse `qa/reports/` for the most recent `2026-05-20-*.md` reports to see
the issues already known from the previous run — anything still broken since
that run is a demo blocker.

---

## Execution

Run the existing Playwright-based QA suite **first**, then do the manual
demo-route walkthrough on top of it.

### Step A — Automated suite

```
pnpm qa
```

This runs the entire phased suite in the prescribed order (smoke → supplier →
package → customer → lifecycle → a11y → phase5). Reports land in
`qa/reports/`, screenshots in `qa/screenshots/`. If you want to re-run a single
phase: `pnpm qa:phase '04-lifecycle'`.

For each phase, after it completes:
- Read the generated report under `qa/reports/2026-05-20-*.md`.
- Tag every finding with severity (Sev-1 blocks the demo, Sev-2 is visible but
  workaround-able, Sev-3 is cosmetic).

### Step B — Live demo-route walkthrough

After the suite finishes, drive the browser yourself through the canonical
workflow above, **as the operator will on stage**. Use a fresh `pnpm db:reset`
DB. For each step:

1. Record the **exact URL** and the **exact button/link text** clicked.
2. Screenshot the result.
3. If a step works → mark `OK` and record the URL of the resulting page.
4. If a step is broken → record the failure mode, then find the shortest
   workaround that still demonstrates the same business outcome (e.g. "the
   stage-transition modal throws, but dragging the Kanban card to the next
   column works" or "voucher Generate button 500s on this booking; switch to
   the seeded `final_paid` Marco Rossi booking and Generate there instead").
5. Continue from the workaround so later steps still get exercised.

The full sequence to walk:

| # | Workflow step | What to click |
|---|---|---|
| 1 | Login | `/login` → **Quick login** |
| 2 | Dashboard loads | sidebar visible, version chip showing |
| 3 | Pipeline Kanban populated | sidebar **Pipeline**; expect 9 stage columns populated |
| 4 | New customer | **Customers** → **Add customer** → fill form → Save |
| 5 | Enquiry created (manually or via replay) | either **Enquiries → New** OR `POST /api/dev/replay-inbound-email` |
| 6 | Quote built | enquiry detail → **Start quote** / **Quotes** tab → 2 line items → Save |
| 7 | Quote sent | **Send quote** (dry-run banner expected) |
| 8 | Quote accepted | stage transition → **accepted** |
| 9 | Deposit invoice generated | **Invoice** tab → **Generate deposit invoice** → PDF opens |
| 10 | Deposit payment recorded | **Record payment** → `deposit_paid` flips |
| 11 | Final invoice generated | **Generate final invoice** → PDF opens |
| 12 | Final payment recorded | balance → R0 |
| 13 | Voucher generated | **Voucher** tab → **Generate voucher** → PDF opens |
| 14 | Booking closed | stage → **closed** |
| 15 | Audit log visible | **Audit** tab shows full history |

---

## Required output

Write **one** report file at `qa/reports/2026-05-20-demo-readiness.md` with
exactly these sections:

### 1. Verdict (one line at the top)
- `READY` — every workflow step works without intervention.
- `READY WITH WORKAROUNDS` — at least one step broken, but a documented
  workaround exists for each.
- `NOT READY` — at least one workflow step has no workaround. Demo is blocked.

### 2. Demo Route (the operator's script)
A numbered list of clicks the operator must perform on stage, end-to-end.
Each line must include:
- The URL before the click.
- The exact label of the button/link to click.
- The expected result on screen.
- If this step replaces a broken canonical step, prefix with `WORKAROUND:` and
  one sentence on what's broken and why this route is used instead.

This section must be **copy-pasteable** — the operator should not have to think
or improvise.

### 3. Findings by severity
- **Sev-1 (demo blockers, no workaround):** list with file/route reference.
- **Sev-2 (broken but workaround exists):** list with workaround.
- **Sev-3 (cosmetic):** list, no action required for demo.

### 4. Suite results
Per QA phase (`smoke`, `01-supplier`, `02-package`, `03-customer`,
`04-lifecycle`, `05-a11y`, `06-phase5`): pass/fail summary and link to the
phase's report.

### 5. Pre-demo checklist
A T-30-minute checklist the operator runs before showing up. Derived from
[docs/demo-prep/runbook.md](runbook.md) but updated for anything this QA run
discovered.

---

## Rules

- **Never** modify seed data or migrations to make a test pass. If a test
  needs a fixture that doesn't exist, that's a Sev-1 finding.
- **Never** skip a phase. If a phase is blocked by an earlier phase, mark it
  `BLOCKED on Phase N` and continue to the next independent phase.
- **Never** edit production app code to silence a failure. Bugs go in the
  report, not into a hotfix commit.
- The only file you should create is the report at
  `qa/reports/2026-05-20-demo-readiness.md`. Do not commit. Do not push.
- Use PowerShell syntax for any shell commands (this is Windows). Chain with
  `;` not `&&`.
- If `pnpm dev` is already running on :3000, do not start a second instance.
- For any "Send" button (quote / invoice / voucher), success in dry-run mode
  is `{ ok: true, dry_run: true }` — no real email goes out. That is the
  expected demo posture, not a bug.

---

## Done condition

You are done when `qa/reports/2026-05-20-demo-readiness.md` exists, contains
all 5 sections, and the **Demo Route** section is a complete click-by-click
script the operator can follow on stage without ever hitting a broken page.
