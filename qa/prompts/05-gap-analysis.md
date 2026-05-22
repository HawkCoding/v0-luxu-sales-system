# Phase 5 — Gap Analysis & Remediation Plan

This is a **Claude session**, not a Playwright run. Read every report under
`qa/reports/{today}-*.md`, dedupe the ❌/⚠️ findings, and produce a
demo-readiness verdict and a prioritized fix list.

## Inputs
- `qa/reports/{today}-01-supplier.md`
- `qa/reports/{today}-02-package.md`
- `qa/reports/{today}-03-customer.md`
- `qa/reports/{today}-04-lifecycle.md`
- `qa/.run-state.json` (the fixture trail — useful for "what state was the
  DB in when this issue surfaced").
- `qa/screenshots/{today}/` (open inline only when the report's text is
  ambiguous).

## Triage categories
Each finding must be slotted into one of these. Reject "miscellaneous."

- **App bug — correctness** (wrong calc, missing guard, broken transition)
- **App bug — persistence** (saves succeed visibly but DB row doesn't update,
  or vice versa — Phase 2 hit this on the active toggle)
- **App bug — a11y** (label not `htmlFor`-associated, `CardTitle` not a
  heading, focus traps, missing aria-* — Phase 2 confirmed several of these
  in the package wizard)
- **App gap — missing UI** (field reachable from API but not from the form;
  e.g. `vip_status`, `dateOfBirth`, `preferences` on customers)
- **App gap — missing artifact** (PDF that should be generated isn't,
  storage row missing, document row missing)
- **Spec bug** (test assumes wrong locator, wrong heading role, etc. — these
  do NOT block the demo but should be fixed so the next QA run is clean.
  Phase 3's `/Customer information/i` heading assertion is a known one)
- **Infra** (db:reset failing because of broken Docker containers, missing
  env vars, etc. — already addressed in part by the admin pre-check in
  `qa/global-setup.ts`)

## Severity scale
- **Sev-1** — blocks the demo. The salesperson cannot finish the flow without
  manual DB intervention. Example: voucher PDF never generates.
- **Sev-2** — visible during the demo but workaround-able with a sentence of
  narration. Example: card title doesn't read like a heading to screen readers.
- **Sev-3** — polish. Example: empty notes render as `null` instead of `—`.

## Effort scale
- **Small** — < 2h. Single file, no migration.
- **Medium** — half-day. Multiple files or one migration.
- **Large** — > 1 day. Cross-cutting refactor or new endpoint.

## Output: `qa/reports/{today}-summary.md`
```
# QA Summary — {today}

## Demo readiness: {GO / GO-with-caveats / NO-GO}
{One sentence with the headline reason.}

## Stage results
| Phase | Steps | Pass | Warn | Fail | Headline issue |
| ----- | ----- | ---- | ---- | ---- | -------------- |
| 01 supplier | … | … | … | … | … |
| 02 package | … | … | … | … | … |
| 03 customer | … | … | … | … | … |
| 04 lifecycle | … | … | … | … | … |

## Sev-1 issues (must fix before demo)
1. {Title} — {category} — {effort}
   - Where: {file paths}
   - Why: {one-sentence diagnosis}
   - Fix: {concrete file/line change, migration if needed, version bump}

## Sev-2 issues (fix before demo if budget allows)
…

## Sev-3 issues (post-demo polish)
…

## Spec hygiene (improve the QA suite itself)
…

## Demo-day workarounds
A short script the demo-er can follow to dodge each Sev-1 issue that didn't
make the fix list. Phrased as "If X happens, do Y."
```

## Rules
- **Quote the report.** Every finding cites the specific report file and step.
  No paraphrased issues.
- **Distinguish app bug from spec bug.** A failing assertion is not the same
  as a failing app. If the locator was wrong, it's a spec bug — file it
  under "Spec hygiene", not Sev-1.
- **Don't invent severities.** If a finding wasn't captured in the report,
  it doesn't exist for this session. Add it to the runbook for the next run.
- **Order the fix list by Sev then Effort.** Sev-1 small first, Sev-1
  large last, then Sev-2, then Sev-3. The salesperson reads top-down on
  demo morning.
- **Bump `APP_VERSION` only when actual app code is changed** by the Phase 5
  follow-up, not by Phase 5 itself.
