# System QA — Shared Preamble

Every prompt in `qa/prompts/system-qa/` inherits this contract. Read it before
starting a run. Do not skip it, and do not re-derive any of it from scratch.

---

## 1. What a run is

You are performing a **quality-assurance pass**, not development.

- You drive the real app in a real browser, observe what happens, and write an
  evidence-backed report.
- **You do not fix code during a QA run.** Findings only. If the user explicitly
  asks for fixes afterwards, that is a separate session.
- You do not commit, do not open PRs, and do not bump `APP_VERSION` (a QA run
  changes no application source).
- You never touch hosted dev or production. Local only.

## 2. Environment bring-up

```powershell
docker ps                 # Supabase containers must be running; if not: pnpm db:start
pnpm db:reset             # applies migrations + supabase/seed.sql — DESTRUCTIVE, local only
pnpm run db:types         # only if migrations changed
pnpm dev                  # http://localhost:3000, ready in ~3s
```

`pnpm db:reset` is mandatory at the start of prompt `01`. For prompts `02`–`19`
**do not reset** unless the prompt says so — later prompts depend on data the
earlier ones created. If you must reset mid-suite, say so in the report and note
which prerequisites you re-created.

Seed baseline after a reset (re-measured 2026-08-11): 18 customers, 9 bookings,
7 quotes, 20 quote_line_items, 9 invoices, 7 payments, 15 suppliers, 5 profiles.
There is no `packages` table — catalogue packages were dropped by migration
`20260811140000_drop_catalogue_packages.sql`.

Bookings cover every pipeline stage (enquiry, quote_sent, accepted,
deposit_requested, deposit_paid, final_paid, voucher_sent, closed ×2). Quote
statuses are 6 `accepted` + 1 `sent`. A `profiles` count above 5 means another
session created test users against the same local database.

## 3. Accounts

| Role | Email | Password |
|---|---|---|
| Admin | `carmen@luxustravel.co.za` | `password123` |
| Manager | `dirk@luxustravel.co.za` | `password123` |
| Consultant | `leonie@luxustravel.co.za` | `password123` |
| Consultant (2nd) | `douwlien@luxustravel.co.za` | `password123` |

Fixtures with seeded user ids: `tests/qa/{admin,manager,consultant}.fixtures.ts`.
The `readonly` clearance level was retired — consultant is the lowest role.

## 4. How to drive the browser

The Playwright MCP server is **disabled** in `.claude/settings.local.json`. Drive
Playwright from a throwaway Node script in the scratchpad instead. `@playwright/test`
is a dev dependency of this repo — resolve it with `createRequire` pointed at the
repo's `package.json` when the script lives outside the repo:

```js
import { createRequire } from "node:module"
const require = createRequire("c:/Users/Hancke/Desktop/luxus-sales-system/package.json")
const { chromium } = require("@playwright/test")
```

Log in through the real form — never fake a session:

1. Go to `/login`
2. Fill `input[type=email]` / `input[type=password]`
3. Click `button[type=submit]`
4. Wait for URL `/app`

After login, `page.request.get/post/patch(...)` carries the session cookies, so you
can drive any `/api/*` route with the same authenticated context. Use this for
setup and for asserting server state; use the UI for the behaviour under test.

Write scripts to the scratchpad, not the repo. Do not commit QA driver scripts.

## 5. Reuse these helpers — do not reinvent them

| Helper | File | Use for |
|---|---|---|
| `labeledInput(scope, "Field name")` | `qa/lib/forms.ts` | shadcn forms whose `<Label>` is not `htmlFor`-associated |
| `fillBuffered`, `fillNumericField` | `qa/lib/forms.ts` | buffered `NumericInput` fields (booking pax, prices) |
| `saveAndWaitFor(page, /\/api\/…/, "POST"\|"PATCH", trigger)` | `qa/lib/forms.ts` | asserting a save actually round-tripped |
| `selectors` | `qa/lib/selectors.ts` | shared stable selectors |
| `login(page)`, `ADMIN_STORAGE_STATE` | `qa/lib/auth.ts` | admin session reuse |
| `createQaSupabase()`, `loadQaEnv()` | `qa/lib/db.ts` | service-role DB assertions |
| `forceAdvanceStage(bookingId, toStage, reason)` | `qa/lib/db-bypass.ts` | documented workaround to get past a broken gate |
| `attachBrowserDiagnostics(page)` | `qa/lib/report.ts` | collecting console errors + 4xx/5xx responses |
| `configurePlaywrightRuntime()` | `qa/lib/browser-runtime.ts` | browser download/runtime setup |
| `tryQuotePreviewSend`, `tryGenerateAndSendDepositInvoice`, `trySendPaymentConfirmation`, `tryGenerateAndSendVoucher`, `collectArtefacts` | `qa/lib/send-flows.ts` | the four client-facing send flows and artefact collection |

Also useful: the API-driven quote recipe in `.claude/skills/verify/SKILL.md`.

## 6. Known traps — read before writing a single selector

1. **`<CardTitle>` renders a `<div>`, not a heading.** `getByRole("heading", …)`
   will not find card titles. Use `getByText` and scope with
   `.locator(...).filter({ has: ... })`.
2. **Never `waitForLoadState("networkidle")` after a save.** Use
   `saveAndWaitFor`. A previous QA phase silently passed a broken toggle for
   exactly this reason.
3. **Reload before asserting persisted state.** SWR will serve stale data.
4. **`app/api/quotes/[id]/route.ts` is UTF-16 on disk.** Grep reports it as a
   binary file; use Read.
5. Buffered numeric inputs do not commit on `fill()` alone — use `fillBuffered`.

## 7. Failure policy — capture, continue, report

A failure at check N must **not** abort checks N+1 onward.

- Screenshot the failure, log it, and keep going.
- If a broken gate blocks the rest of the flow, call
  `forceAdvanceStage(bookingId, toStage, reason)` and **log both the workaround
  and the reason it was needed**. Every `forceAdvanceStage` call is at minimum a
  Sev-2 finding.
- If a prerequisite from an earlier prompt is missing, mark the affected checks
  **BLOCKED on QA-{NN}** and move on. Do not invent fixtures to paper over it.

## 8. Evidence rules

- A **PASS** must cite what you observed: a screenshot path, an HTTP status, a
  JSON field, or a SQL result. "Looks correct" is not evidence.
- A **FAIL** must carry a reproduction someone else can follow, plus expected vs
  actual.
- Screenshot every key UI state, pass or fail:
  `qa/screenshots/system-qa/{NN}/{check}-{state}.png`
- Attach `attachBrowserDiagnostics(page)` for the whole run and dump the console
  errors and 4xx/5xx responses it collected into the report, even for checks
  that otherwise passed.

## 9. Severity scale

| Sev | Meaning |
|---|---|
| **Sev-1** | Blocks a business flow. Cannot be worked around by a user. |
| **Sev-2** | Wrong data, wrong document output, wrong money, or a guard that does not hold. Workaround exists. |
| **Sev-3** | UX, accessibility, or confusing behaviour. Flow completes. |
| **Sev-4** | Cosmetic. |

## 10. Report contract

Write to `qa/reports/system-qa/{YYYY-MM-DD}-{NN}-{slug}.md`. Create the directory
if it does not exist. (`qa/reports/` and `qa/screenshots/` are gitignored — QA
output stays local unless the user asks otherwise.)

```markdown
# QA {NN} — {Area} — {YYYY-MM-DD}

Env: local · App version: {APP_VERSION from lib/version.ts} · Commit: {git rev-parse --short HEAD}
Roles used: … · Duration: … · Database: reset at start? yes/no

## Summary
| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | …     | PASS / FAIL / BLOCKED / PARTIAL | screenshot or status |

## Findings

### F{NN}-1 — {short title} · Sev-{n} · {route or file:line}
- **Repro:** numbered steps
- **Expected:**
- **Actual:**
- **Evidence:** screenshot path / HTTP status / query result
- **Suspected cause:** file:line if you can point at it, otherwise "unknown"

## Console & network errors
(from attachBrowserDiagnostics — table of message, route, count)

## Workarounds used
(every forceAdvanceStage or manual DB write: booking id, target, reason)

## Not covered
(anything in this prompt's scope you could not reach, and why)

## Verdict
GREEN (ship) / YELLOW (ship with known issues) / RED (blocked)
```

Finish by printing the report path.

## 11. Session hygiene

One prompt per session. When a prompt is done, write the report, print the path,
and stop. Run `/clear` before starting the next prompt — a QA pass over one area
should not carry the context of another.
