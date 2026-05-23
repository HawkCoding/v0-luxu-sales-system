# Phase 3 — Customer (manual entry) QA

## Goal
Drive the manual customer-create flow end-to-end through the real UI as the admin user, verify the `QA_RUN.customer` fixture round-trips into the database and detail view, exercise duplicate-email behaviour, and write a markdown report at `qa/reports/{date}-03-customer.md`.

## Scope
- **Surface under test:**
  - Page: [app/app/customers/page.tsx](../../app/app/customers/page.tsx)
  - Dialog: [components/create-customer-dialog.tsx](../../components/create-customer-dialog.tsx)
  - Detail view (notes edit): [components/customer-detail-view.tsx](../../components/customer-detail-view.tsx)
  - API: [app/api/customers/route.ts](../../app/api/customers/route.ts) (`createCustomerSchema` lines 9-22)
  - DB table: `customers`
- **In scope:** manual entry only. Email-parse / import flow is **out of scope** for this round.
- **Fixture:** `QA_RUN.customer` from [qa/lib/test-data.ts](../lib/test-data.ts) — James Whitmore, UK, leisure traveller.
- **Cumulative:** does NOT reset the DB. Phase 4 needs the customer id this phase writes into `qa/.run-state.json`.

## Spec
- Driver: [qa/specs/03-customer.spec.ts](../specs/03-customer.spec.ts)
- Run isolated: `pnpm qa:phase '03-customer'`
- Authenticated via `ADMIN_STORAGE_STATE` from Phase 0.

## Locator guidance (lessons from Phase 2 — read before debugging this spec)
- **`<CardTitle>` does NOT render as an ARIA heading.** It is a `<div>` in shadcn.
  `getByRole("heading", { name: /Customer information/i })` returns nothing
  even though the text is on screen. Use `page.getByText("Customer information")`
  or the surrounding card's structure instead.
  This is the exact reason the current Phase 3 spec fails at line 219 — it
  predates the Phase 2 findings.
- **Many shadcn forms have unassociated labels.** When `getByLabel(...)` returns
  nothing, fall back to the shared `labeledInput(scope, "Field Name")` helper in
  [qa/lib/forms.ts](../lib/forms.ts). The Create Customer dialog likely needs
  this for at least some fields — verify field by field, prefer `getByLabel`
  where it works (the supplier dialog uses proper associations).
- **Don't trust `waitForLoadState("networkidle")` after a save.** Use
  `saveAndWaitFor(page, /\/api\/customers\b/, "POST", trigger)` from
  [qa/lib/forms.ts](../lib/forms.ts). Same applies to PATCH on edit-notes
  and the duplicate-email POST.

## Scenario
1. Navigate to `/app/customers`. Capture the page state and note the customer count.
2. Open the "New Customer" dialog.
3. **Negative path — empty submit.** Submit without filling anything. Expect inline validation on `firstName`, `lastName`, and `email`. Note that the Zod schema in [app/api/customers/route.ts](../../app/api/customers/route.ts#L9) treats `title`, `phone`, `country`, `province`, etc. as optional, so the form should only flag the three required fields. If the submit button is disabled before fields are touched, capture that as a UX note rather than a fail.
4. **Negative path — malformed email.** Enter `not-an-email` in the email field, blur, and capture the inline message ("Must be a valid email address").
5. **Happy path — full fixture.** Fill in the fixture (title, first name, last name, email, phone, country, notes). The dialog does NOT expose `province`, `vipStatus`, `dateOfBirth`, or `preferences` — these only exist on the API and the detail view. Capture this surface gap as a **warn**.
6. Submit. Wait for the customer detail modal to open. Capture the resulting customer id from the URL pushed by [app/app/customers/page.tsx:151](../../app/app/customers/page.tsx#L151).
7. Close the detail modal, return to the list, and verify the new customer is visible (search for the email).
8. Open the customer detail page directly via `/app/customers/{id}`. Round-trip every fixture field that is displayed. Capture any field that renders as `null`, `undefined`, or an inconsistent empty placeholder.
9. **Edit notes.** Click `Edit`, change the notes text, click `Save changes`, confirm the new value sticks after reload.
10. **Duplicate detection.** Reopen the create dialog, enter the same email, and submit. Expect the API to return 409 and the dialog to show "A customer with this email address already exists." Capture the exact UX (inline error, toast, or silent failure).
11. **DB check** (via service-role): confirm exactly one `customers` row with `email = 'james.whitmore+qa@example.com'`. Record `id`, `first_name`, `last_name`, `email`, `phone`, `country`, `province`, `title`, `notes`, `vip_status`, `date_of_birth`, `preferences`, `is_repeat_client`.
12. Persist `customer.id` into `qa/.run-state.json` so Phase 4 can find James Whitmore without re-querying.

## Report (`qa/reports/{date}-03-customer.md`)
The fixed sections from `ReportBuilder` are filled with:
- **Goal / Environment** — admin auth + baseURL.
- **Steps** — each scenario step above, with screenshots and JSON evidence (validation strings, URLs, ids, etc.).
- **Database Evidence** — the `customers` row, plus a duplicate-count check (`SELECT count(*) FROM customers WHERE email = ...` style query result).
- **Issues Found** — auto-aggregated from every `warn`/`fail` step.
- **Severity Summary** — pass/warn/fail counts.

The report MUST explicitly call out:
- Which Zod-required fields are validated client-side and which are not (diff against schema).
- Whether `province`, `vipStatus`, `dateOfBirth`, `preferences`, `communication_preferences` are reachable from the manual form at all.
- Exact duplicate-email behaviour (status code, UI surface, whether toast or inline error).
- Any console errors or 4xx/5xx responses captured by `attachBrowserDiagnostics`.

## Acceptance
- `pnpm qa:phase '03-customer'` produces `qa/reports/{today}-03-customer.md`.
- The DB has exactly one James Whitmore row.
- `qa/.run-state.json` now contains `{ customer: { id } }`.
- Every red/yellow signal is in the Issues Found section so Phase 5 can mine it.
