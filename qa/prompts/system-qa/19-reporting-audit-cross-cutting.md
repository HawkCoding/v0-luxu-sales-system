# QA 19 — Reporting, Audit, Error Log & Cross-Cutting

Read `@qa/prompts/system-qa/_preamble.md` first. Do not skip it.

## Goal

Close the suite. Two halves: (a) the read-only surfaces that report on everything
prompts 01–18 created — reporting, audit, error log — where the test is whether
the numbers reconcile with the database; and (b) a cross-cutting sweep for
accessibility, responsiveness, state handling and console noise across the whole
app.

## Prerequisites

Prompts 01–18 complete. Their reports are the source of truth for the expected
numbers — have them to hand. Run as admin and manager (`view:reporting` and
`view:full_audit` are role-sensitive).

## Surfaces under test

- [app/app/reporting/page.tsx](../../../app/app/reporting/page.tsx), `app/api/reports/[report]/route.ts` + `/export`
- [app/app/audit/page.tsx](../../../app/app/audit/page.tsx), [app/app/audit/archive/page.tsx](../../../app/app/audit/archive/page.tsx), [app/app/audit/layout.tsx](../../../app/app/audit/layout.tsx), [components/audit-log-view.tsx](../../../components/audit-log-view.tsx), [app/api/audit/route.ts](../../../app/api/audit/route.ts), [app/api/audit/export/route.ts](../../../app/api/audit/export/route.ts)
- [app/app/settings/error-log/page.tsx](../../../app/app/settings/error-log/page.tsx), [app/api/error-logs/route.ts](../../../app/api/error-logs/route.ts), `app/api/error-logs/[id]/resolve/route.ts`, [app/api/client-errors/route.ts](../../../app/api/client-errors/route.ts)
- [components/job-audit-tab.tsx](../../../components/job-audit-tab.tsx), [components/presence-avatars.tsx](../../../components/presence-avatars.tsx)
- [app/app/page.tsx](../../../app/app/page.tsx) — dashboard KPI cards
- [lib/utils.ts](../../../lib/utils.ts) (`cn`), [components/ui/*](../../../components/ui), [app/globals.css](../../../app/globals.css)

## Part A — Reporting

### Dashboard

1. Every KPI stat card on `/app/page.tsx` — verify each number against a direct
   DB query. Record both figures side by side. A KPI that disagrees with the
   database is Sev-2.
2. Each stat card's click-through goes where it claims (this is the only route to
   `/app/payments`).
3. The unresolved-error tile count matches `/app/settings/error-log`.

### Overview cards

4. Verify each against the DB: Pipeline Distribution, Revenue by Method, Top
   Customer Countries, Quote Status Breakdown, Bookings by Source, Bookings by
   Consultant, Upcoming Departures.
5. **Cancelled and lost bookings** from QA 15 must be treated consistently across
   all seven — cancelled revenue counted as revenue anywhere is Sev-2.
6. Empty/zero states render properly rather than showing `NaN`, `0.00%` from a
   divide-by-zero, or a blank card.

### Filtered reports

7. The five reports — Sales per Salesperson, Conversion Rate, Revenue per
   Product, Outstanding Payments, Enquiries by Source. For each: run unfiltered,
   verify against the DB, then apply each filter (From/To, Consultant, Product,
   Stage) individually and in combination.
8. Date boundary behaviour: a booking created exactly on the From date and one
   exactly on the To date — inclusive or exclusive? Record it; an off-by-one on a
   month-end report is a real finding.
9. **CSV export** for each of the five (`/api/reports/{report}/export`). Open each
   file: header row correct, row count matches the on-screen report, numbers
   match, encoding correct for accented names, and a value containing a comma or
   quote is escaped properly. `export:reporting` gating confirmed.
10. Outstanding Payments must reconcile against the balances recorded in QA 13
    and QA 15.
11. Conversion Rate must reconcile against the won/lost outcomes from QA 14 and
    QA 15.
12. `view:reporting` is admin+manager — consultant blocked at the API, and the
    direct-URL behaviour recorded (per QA 03 check 4).

## Part B — Audit & error log

13. `/app/audit` — the transitions, payments, overrides and outcome changes from
    prompts 08–15 all appear, with the correct actor, timestamp and entity.
14. Spot-check five specific actions you know you performed and confirm each has
    an audit entry: a stage change, the manager override from QA 12, a payment,
    a document delete, a user deactivation.
15. Filters and search on the audit view.
16. `/app/audit/archive` — confirm what moves an entry to the archive and that
    the archive view uses the same component with `scope="archive"`.
17. `/api/audit/export` produces a file that opens and matches the on-screen rows.
18. The **server redirect** on `app/app/audit/layout.tsx` for consultant
    (re-confirming QA 03 check 3).
19. `view:full_audit` — manager sees more than admin per
    `lib/role-context.tsx:50`. Confirm what the extra actually is and re-flag the
    asymmetry.
20. The booking's own Audit tab shows that booking's entries, scoped correctly —
    no other booking's history visible.
21. `/app/settings/error-log` — severity and resolved filters; resolve an entry
    (`canResolve` = admin+manager) and confirm it leaves the unresolved count.
22. Trigger a real server error (a deliberate bad API call) and confirm it lands
    in the error log with enough context to debug and **without leaking a stack
    trace or connection string to the client response**.
23. `POST /api/client-errors` — trigger a browser-side error and confirm it is
    captured.

## Part C — Cross-cutting sweep

Run over the ten most-used screens: dashboard, enquiries, pipeline, bookings
list, booking detail (each of the ten tabs), customers, suppliers, documents,
correspondence, settings.

### Accessibility

24. **Keyboard only.** Complete one full flow — create an enquiry, add a quote
    line, record a payment — without touching the mouse. Every control must be
    reachable and operable. Anything reachable only by mouse is Sev-3; a
    *required* control unreachable by keyboard is Sev-2.
25. **Focus visible** on every interactive element. Tab through each screen and
    screenshot any element that takes focus invisibly.
26. **Tab order** follows visual order; no focus traps in modals; Escape closes
    modals and returns focus to the trigger.
27. Semantic HTML: buttons for actions, links for navigation. Note any `<div>`
    with a click handler and no role.
28. `aria-*` where semantics are insufficient — dialogs labelled, live regions
    for toasts, form errors associated with their inputs.
29. **Never colour alone.** Every status pill, stage indicator, severity badge
    and validation error must carry text or an icon as well as a colour. Check
    each in greyscale.
30. Images have alt text; icon-only buttons have accessible names.

### Responsive

31. At **375px** width: every screen usable, no horizontal body scroll, tables
    scroll inside their own container, modals fit, the sidebar collapses
    correctly.
32. At 768px and 1280px.
33. Long content: a customer with a very long name, a booking with 15 legs, a
    60-line quote — no overflow breaking the layout.

### State handling

34. Every data-driven component handles **loading, empty, error and success**.
    Throttle the network and confirm loading states appear rather than a flash of
    empty. Kill the API (block the request) and confirm an error state, not a
    permanent spinner or a blank page.
35. SWR staleness: perform a write in one tab, switch to another tab showing the
    same data, and confirm it refreshes or clearly indicates staleness.
36. `components/presence-avatars.tsx` — open the same booking as two users and
    confirm presence shows correctly and clears on leave.
37. Optimistic UI: where a change appears instantly, force the server call to
    fail and confirm the UI rolls back rather than showing a change that was
    never saved. A false success is Sev-2.

### Console & network hygiene

38. With `attachBrowserDiagnostics` running, visit every screen and record: React
    key warnings, hydration mismatches, uncaught promise rejections, 4xx/5xx
    calls, and any request firing repeatedly in a loop.
39. Check for a request storm — a component re-fetching on every render is a
    performance Sev-3 and shows up clearly in the network log.

## Report

`qa/reports/system-qa/{date}-19-reporting-audit-cross-cutting.md`

Extra sections:

- **Reconciliation table**: metric · reported value · DB value · match?
  Every KPI, overview card and report.
- **Audit coverage**: the five spot-checked actions and whether each was logged.
- **A11y findings** by screen and WCAG-ish category.
- **Responsive findings** by breakpoint with screenshots.
- **Console/network tally**: message · screen · count.

## Acceptance

- Every reported number has a DB counterpart in the reconciliation table.
- The keyboard-only flow (24) completed or the exact blocker identified.
- All five CSV exports opened and checked, not just downloaded.
- Console tally covers all ten screens.

---

## Final step — suite summary

This is the last prompt. After writing this report, produce
`qa/reports/system-qa/{date}-00-SUITE-SUMMARY.md`:

- One row per prompt 01–19: area · verdict (GREEN/YELLOW/RED) · Sev-1 count ·
  Sev-2 count · report path.
- **All Sev-1 findings across the whole suite**, ranked, each with its repro.
- **All Sev-2 findings**, grouped by area.
- Anything marked "Not covered" in any report, collected into one list, checked
  against `COVERAGE.md`.
- An overall verdict and the three things to fix first.
