# QA Plan — PR #62 Broken-Button Audit

## Background

Three API routes from closed PR #62 (`feature/pipeline-job-workflow`) are missing on
the current branch (`phase5/system-improvements`), but the UI that calls them was
restored during demo-prep. Result: three buttons currently 404.

This QA plan determines, per button, whether restoring the route gives real value
or whether the calling UI should be deleted as dead code.

Missing routes (canonical source: `origin/feature/pipeline-job-workflow`):

- `app/api/jobs/[id]/clear-import-review/route.ts`
- `app/api/jobs/[id]/ownership/route.ts`
- `app/api/jobs/[id]/start-quote/route.ts`

The closing of PR #62 was not a design decision to drop the work — it was an
abandonment during a context switch into demo-prep. Local was then rebuilt from a
different baseline ("local pre-demo work wins" stash-apply, commit `4e0be11`),
which is why these route files dropped off local while their callers stayed.

---

## Prompt to give the agent

Copy-paste the block below into a fresh Claude Code session in this repo.

```
You are running a QA audit defined in docs/demo-prep/pr62-broken-button-audit.md.

Read that file first, then execute Tests 1, 2, and 3 exactly as specified.

For each test:
- Run the baseline check (confirm the current 404).
- DO NOT yet restore any routes or change source code.
- Run the value-check queries / inspections specified in that test.
- Produce a FIX / DELETE / SKIP verdict per test with a one-line reason.

Output a single verdict block at the end in this format:

  VERDICTS
  Test 1 (start-quote):         FIX | DELETE | SKIP — <reason>
  Test 2 (ownership):           FIX | DELETE | SKIP — <reason>
  Test 3 (clear-import-review): FIX | DELETE | SKIP — <reason>

Do not actually restore routes or delete UI in this run. Audit only.
Report blockers (e.g. local Supabase not running) inline and continue with the
other tests where possible.
```

---

## Procedure (what the agent will execute)

For each test:

1. **Baseline (broken state).** Boot `pnpm dev` if not running. Log in. Trigger
   the button. Capture the network response status + toast text. Confirm 404.
2. **Value check.** Run the inspection queries listed under the test. Goal: decide
   whether the feature provides real value in the current demo / single-user
   workflow.
3. **Verdict.** Record FIX / DELETE / SKIP with one-line reason.

Do **not** restore routes or delete UI in the audit pass. The user reviews
verdicts before any code change.

---

## Test 1 — Start Quote

- **Route:** `POST /api/jobs/[id]/start-quote`
- **Caller:** `components/job-enquiry-tab.tsx:169`
- **Trigger:** Open a job in `enquiry` stage with no draft quotes → "Start quote"
  button on Enquiry tab.

**Expected restored behavior:**
- Creates a draft quote (`Q1` version, reference like `BT-2026-NNNN-Q1`).
- Job stage advances out of `enquiry`.
- Toast: "Draft quote created".
- 422 with `failures[]` array if gate validation fails.

**Value-check inspections:**
- Search for alternative quote-creation entry points: are there other UI
  buttons or routes (`POST /api/quotes`) that can create a draft quote from an
  enquiry? Check `app/api/quotes/route.ts` and the enquiries list UI.
- If no alternative entry exists, this button is the pipeline's entry point.

**Decision rule:**
- No alternative entry → **FIX** (required for demo)
- Alternative entry exists and is wired in UI → **DELETE** the button

---

## Test 2 — Ownership / Salesperson Reassignment

- **Route:** `POST /api/jobs/[id]/ownership`
- **Callers:**
  - `app/app/jobs/[id]/page.tsx:441` — reassign salesperson dropdown.
    Payload: `{action: "assign", userId}` or `{action: "release"}`.
  - `app/app/jobs/[id]/page.tsx:491` — Claim/Release buttons.
    Payload: `{action: "claim" | "release"}`.

**Expected restored behavior:**
- `assign` / `claim`: sets `bookings.assigned_user_id`, writes audit log.
- `release`: sets `bookings.assigned_user_id = null`.
- Toasts: "Salesperson reassigned" / "Booking claimed" / "Booking released".

**Value-check inspections:**
- Count salespeople: `SELECT count(*) FROM profiles WHERE clearance_level = 'salesperson'`.
- Check the demo runbook (`docs/demo-prep/runbook.md`): does the script demo
  team workflow / multi-user assignment?

**Decision rule:**
- 2+ salespeople **and** demo covers team workflow → **FIX**
- Single salesperson **or** demo is single-user → **DELETE** the reassign
  dropdown + claim/release buttons (and any state vars used only by them)

---

## Test 3 — Clear Import Review

- **Route:** `POST /api/jobs/[id]/clear-import-review`
- **Caller:** `app/app/jobs/[id]/page.tsx:402`
- **Trigger:** Job created via inbound-email import with
  `email_import_needs_review = true` → "Resolve" button on job detail.

**Expected restored behavior:**
- Sets `bookings.email_import_review_resolved_at = now()`.
- Removes the "needs review" banner.
- Toast: "Import review cleared".

**Value-check inspections:**
- `SELECT * FROM inbound_email_accounts` — is an account seeded?
- `SELECT count(*) FROM bookings WHERE email_import_needs_review = true` —
  is there test data?
- Check the demo runbook: does the demo show inbound-email booking creation?

**Decision rule:**
- Inbound email is demoed → **FIX**
- Inbound email is not demoed → **DELETE** the Resolve button (and consider
  hiding the entire `email_import_needs_review` banner path)

---

## Expected verdict format

```
VERDICTS
Test 1 (start-quote):         FIX | DELETE | SKIP — <reason>
Test 2 (ownership):           FIX | DELETE | SKIP — <reason>
Test 3 (clear-import-review): FIX | DELETE | SKIP — <reason>
```

---

## After the audit returns

Bring the verdicts back here. The follow-up implementation pass will:

- For each **FIX**:
  `git show origin/feature/pipeline-job-workflow:<path> | Out-File -Encoding utf8 <path>`
  then run `pnpm build` and re-test the button.
- For each **DELETE**: remove the calling handler + button + any state vars used
  only by it from the UI file.
- Bump `APP_VERSION` once.
- Commit as `fix(pipeline): resolve broken UI/route mismatches from #62 abandonment`.

---

## Stretch — same framing for behavioral gaps

Once the route question is settled, the same FIX / DELETE / SKIP framing can be
run for the policy gaps from the other closed PRs:

- **PR #58** invoice-sent audit logging — value check: is there a compliance
  requirement to know when an invoice was marked sent?
- **PR #63** settings-change audit logging — value check: same, for settings.
- **PR #64** role-based markup display — value check: open `/app/packages` as a
  salesperson and check whether the displayed price is raw supplier price or
  already markup-adjusted. If raw → FIX is real.
