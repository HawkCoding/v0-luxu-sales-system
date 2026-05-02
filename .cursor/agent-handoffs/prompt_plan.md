I read `.cursor/agent-handoffs/spec.md` and sampled the current repo. Important grounding: this is not greenfield. The app already has Next.js App Router, Supabase, bookings as the primary job/enquiry entity, suppliers/packages/rates, inbound email sync, audit logs, pipeline pages, and Vitest coverage. So the safest blueprint is to evolve the existing `bookings` model rather than introduce parallel `jobs`/`enquiries` tables unless a migration explicitly justifies it.

The other open-tab paths shown by the IDE were deleted/missing in this workspace, so I used the handoff spec as source of truth.

## Build Blueprint

1. **Stabilize the foundation**
   - Audit current schema/API/UI against the spec.
   - Keep `bookings` as the app’s canonical “job card” unless renaming is deliberately planned.
   - Confirm auth, role permissions, settings access, audit logging, and hidden company scoping.
   - Add missing tests before changing behavior.

2. **Complete enquiry intake**
   - Harden SA-Rail Blue Train and Rovos parsing.
   - Ensure required-field review gates are enforced.
   - Ensure imported enquiries land on New Enquiries before pipeline.
   - Finish duplicate detection and mailbox filing failure visibility.

3. **Job card and pipeline workflow**
   - Implement ownership, release, reassignment, and `Start Quote`.
   - Enforce pipeline transition rules.
   - Add outcome handling for won/lost/cancelled.
   - Make audit history reliable and visible.

4. **CRM completion**
   - Match customers by email.
   - Track repeat-client state.
   - Update first/last travel dates when voucher is sent.
   - Add customer profile fields and booking history.

5. **Supplier and pricing completion**
   - Finish supplier categories/kinds vocabulary.
   - Harden route/service/pricing-option/rate-card management.
   - Prevent overlapping rates.
   - Implement component pricing, fixed package pricing, markups, supplements, child/infant pricing, and override audit logging.

6. **Quotes**
   - Build quote calculation and quote builder.
   - Add quote versioning and validity.
   - Generate quote PDF and email summary.
   - Add acceptance link and deposit invoice creation.

7. **Invoices and payments**
   - Generate deposit/final invoices.
   - Capture manual payments and proof uploads.
   - Calculate balances.
   - Gate booking confirmation on deposit paid.
   - Add reminders and overdue flags.

8. **Vouchers**
   - Generate modular voucher service blocks.
   - Block voucher generation until required fields are complete and balance is zero.
   - Generate/send voucher PDF.
   - Update customer travel dates and pipeline stage.

9. **Reports and system tools**
   - Dashboard metrics.
   - Sales/conversion/revenue reports.
   - CSV/PDF exports.
   - Error logs with badge.
   - Backup and full restore.

10. **Final hardening**
   - End-to-end tests for Blue Train enquiry to quote, Rovos enquiry to voucher, and cancellation/refund.
   - Security review.
   - UAT checklist.
   - Production readiness pass.

## Iterative Chunks

The right-sized sequence I’d use is:

1. Spec-to-current-state audit.
2. Company/settings/auth/role foundation.
3. Enquiry parser hardening.
4. Inbound email persistence and duplicate behavior.
5. New Enquiries ownership and review workflow.
6. Pipeline transition gates.
7. Customer CRM completion.
8. Supplier/rate-card validation.
9. Package pricing engine.
10. Quote lifecycle.
11. Quote PDF/email/acceptance.
12. Invoice and payment lifecycle.
13. Voucher lifecycle.
14. Reporting/error/backup tools.
15. E2E and UAT hardening.

Each step is small enough to test safely, but integrated enough that no code sits unused.

## Prompt 1 — Current-State Audit

```text
You are working in the Luxus Sales System repo.

Before changing code, inspect:
- .cursor/agent-handoffs/spec.md
- package.json
- lib/types.ts
- lib/use-data.ts
- lib/supabase/server.ts
- app/app/layout.tsx
- current Supabase migrations
- app/api routes
- existing tests

Produce a concise implementation audit comparing the spec to the current app.

Important constraints:
- Use pnpm only.
- Next.js App Router only.
- Supabase access must use createSessionClient for user-scoped server/API operations.
- Do not introduce a parallel jobs/enquiries domain if the current app already uses bookings as the primary job card entity.
- Do not change code in this step unless a failing test or type issue blocks the audit.

Output:
1. What is already implemented.
2. What is partially implemented.
3. What is missing.
4. Recommended canonical domain names for this repo.
5. A proposed next-step checklist ordered by dependency.
```

## Prompt 2 — Foundation Tests And Role Boundaries

```text
Add focused tests for the current role and protected-route foundation.

Scope:
- Verify app/app/layout.tsx redirects unauthenticated users.
- Verify roles are resolved from JWT clearance_level when available.
- Verify fallback profile clearance_level behavior.
- Verify invalid or missing profile role redirects.
- Add or update tests for lib/role-utils.ts and settings access helpers if coverage is missing.

Do not redesign auth.
Do not add client-side-only route protection.
Use existing patterns and Vitest.

After code changes:
- Run pnpm test:ci.
- Run pnpm app:version:bump exactly once before finishing.
```

## Prompt 3 — Enquiry Parser Hardening

```text
Harden the SA-Rail enquiry parser in lib/import/parseEmailDraft.ts.

Start with tests. Add coverage for:
- Blue Train labelled fields.
- Rovos Rail labelled fields.
- Suite Type 1 through Suite Type 10.
- Purpose values: Quote, Availability, Reservation.
- Package option.
- Hotel booking type and hotel option.
- Flight route and flight departure date.
- Additional services.
- Terms accepted.
- Missing required fields.
- Extra blank lines, casing variants, duplicate labels, date with asterisk.

Then update the parser minimally until tests pass.

Keep parser output compatible with existing buildEnquiryImportPayload and inbound email import code.
Do not introduce a new parsing library unless necessary.

Run:
- pnpm test:ci
- pnpm app:version:bump once
```

## Prompt 4 — Review Gate For Imported Enquiries

```text
Implement and test the imported enquiry review gate.

Behavior:
- Imported bookings with missing required fields, low confidence fields, or warnings must have email_import_needs_review = true.
- Needs Review bookings must not move into the visible pipeline until review is resolved.
- Core customer contact fields must be complete before forward movement.
- Review resolution must be auditable.

Start with tests around:
- lib/inbound-email/review.ts
- pipeline transition validation
- API route that changes booking stage/status
- New Enquiries UI behavior if already present

Use existing bookings fields where possible.
If a small migration is required, make it idempotent.

Run pnpm test:ci and bump APP_VERSION once.
```

## Prompt 5 — New Enquiries Ownership Workflow

```text
Complete the New Enquiries workflow.

Behavior:
- Imported enquiries appear on /app/enquiries and not on the active Kanban pipeline.
- Consultant can Take Ownership.
- Owner can Release Ownership.
- Admin/Manager can reassign.
- Start Quote moves the booking from enquiry/pre-pipeline into Quote Sent or the repo’s canonical quote-preparation state if one already exists.
- All ownership and Start Quote actions create audit logs.

Implement API routes with:
- createSessionClient
- supabase.auth.getUser()
- role checks
- Zod validation
- consistent { error, details? } responses

Add tests for success, unauthenticated, forbidden, and invalid input paths.
Run pnpm test:ci and bump APP_VERSION once.
```

## Prompt 6 — Pipeline Transition Rules

```text
Harden pipeline stage movement.

Visible stages:
- Quote Sent
- Quote Accepted
- Deposit Invoice Sent
- Deposit Paid
- Paid in Full
- Voucher Sent

Rules:
- Needs Review blocks forward movement.
- Deposit Paid cannot be reached unless deposit_paid is true.
- Voucher Sent cannot be reached unless invoice_balance = 0 and required booking/customer fields are complete.
- Lost and Closed are outside active Kanban.
- Every transition is audited.

Start by adding tests to lib/pipeline/validate-transition.ts and app/api/jobs/[id]/validate-stage-move/route.ts.
Then implement minimal changes.

Do not break legacy stage aliases unless tests confirm safe removal.
Run pnpm test:ci and bump APP_VERSION once.
```

## Prompt 7 — Customer CRM Completion

```text
Complete customer CRM behavior.

Behavior:
- Inbound enquiry matches customer by email only.
- Existing customer is linked, not duplicated.
- New email creates a new customer even if name matches.
- Repeat client flag is set when existing customer has at least one completed trip.
- When a booking reaches Voucher Sent, update customer first_travel_date and last_travel_date from train departure date.
- Add customer profile fields if missing: title, province, birthday, vip_flag, preferences, notes, first_travel_date, last_travel_date.

Use migrations only for missing columns.
Update lib/types.ts, API serialization, and customer detail UI as needed.
Add tests for matching, repeat client, and travel-date updates.

Run pnpm test:ci and bump APP_VERSION once.
```

## Prompt 8 — Supplier And Rate Validation

```text
Finish supplier and rate-card validation.

Behavior:
- Supplier company records hold company/contact data only.
- Prices live on rate cards, not suppliers.
- Supplier kinds support train, hotel, transfers, tours, airlines.
- UI vocabulary changes by supplier kind.
- Rate cards select by departure date.
- Open-ended valid_to works.
- Overlapping rates are blocked for the same route + pricing option + period.
- Consultant cannot create/edit supplier rates.
- Manager/Admin can manage rates.

Start with tests for helper/schema code and API routes.
Reuse existing supplier vocabulary and route/rate structures.
Do not create duplicate legacy pricing tables.

Run pnpm test:ci and bump APP_VERSION once.
```

## Prompt 9 — Package Pricing Engine

```text
Build the quote pricing engine as a pure, tested module before wiring UI.

Requirements:
- Support stored fixed package price.
- Support calculated component total from package legs/rate cards.
- Apply configured markup/supplement rules.
- Support child and infant prices where configured.
- VAT-inclusive values only.
- No rounding beyond existing currency display formatting.
- Consultant can choose stored_package or calculated_components at quote generation.
- Record selected pricing source.

Create tests first for fixed price, component price, missing rate, supplement, child/infant, and manual rate override audit metadata.

Then wire the module into the package/quote flow without changing unrelated UI.
Run pnpm test:ci and bump APP_VERSION once.
```

## Prompt 10 — Quote Lifecycle

```text
Implement quote lifecycle behavior.

Requirements:
- Quote number format follows booking number plus quote version, e.g. BT-2026-0001-Q1.
- Quote title: PROVISIONAL QUOTATION.
- Status label: STATUS: Provisional.
- Default validity comes from settings, defaulting to 30 days unless current app settings specify otherwise.
- Meaningful resent quote changes create a new version.
- Previous versions remain available.
- Quote edits after sending are audited.
- Quote acceptance records accepted_at and advances workflow only through valid transition rules.

Add tests for numbering, versioning, validity, acceptance, and audit.
Wire into existing quote APIs and job quote tab.

Run pnpm test:ci and bump APP_VERSION once.
```

## Prompt 11 — Quote PDF, Email, And Acceptance Link

```text
Wire quote document sending end to end.

Requirements:
- Generate formatted quote PDF.
- Send quote email summary with PDF attachment using the existing email provider pattern.
- Store generated document record.
- Store correspondence/timeline record with subject, recipients, timestamp, and status.
- Acceptance link must be tokenized and not require customer login.
- Accepting quote creates deposit invoice or triggers the existing deposit-invoice creation path.

Start with service-level tests using mocks for PDF, storage, and email.
Then add API route tests.
Finally wire UI action in the quote tab.

Run pnpm test:ci and bump APP_VERSION once.
```

## Prompt 12 — Invoices And Payments

```text
Complete invoice and manual payment workflow.

Requirements:
- Generate deposit invoice after quote acceptance.
- Generate final invoice.
- Invoice numbering is deterministic and tested.
- Default deposit is 25%.
- Booking cannot be confirmed without deposit_paid = true.
- Manual payment capture requires amount, date, method, and reference.
- Proof of payment upload is stored as an attachment/document.
- invoice_balance updates from invoices minus payments.
- Overdue payment flags use configurable settings.

Add unit tests for calculations and API tests for validation/permissions.
Mock storage/network boundaries.
Wire into job payments/invoices UI.

Run pnpm test:ci and bump APP_VERSION once.
```

## Prompt 13 — Voucher Lifecycle

```text
Implement modular voucher generation and sending.

Requirements:
- Voucher generation is blocked unless invoice_balance = 0.
- Voucher generation is blocked if required booking/customer fields are incomplete.
- Voucher number is generated deterministically.
- Voucher consists of modular service blocks.
- Service blocks include supplier references and contact details.
- Voucher PDF is generated and stored.
- Sending voucher creates correspondence/timeline/audit records.
- Booking moves to Voucher Sent through transition validation.
- Customer first/last travel dates update when voucher is sent.

Start with tests for gate logic and service block rendering.
Then add API route tests.
Finally wire UI controls in the job documents/voucher area.

Run pnpm test:ci and bump APP_VERSION once.
```

## Prompt 14 — Reports, Error Logs, And Backup Tools

```text
Finish operational system tools.

Requirements:
- Dashboard metrics for active pipeline, new enquiries, revenue, conversion, and unresolved errors.
- Reports for sales per salesperson, conversion rate, revenue per product.
- CSV export first; PDF export only if existing document tooling can support it cleanly.
- Error logs support severity: Critical, Warning, Info.
- Settings shows a badge when unresolved errors exist.
- Users can mark errors resolved.
- Backup worker creates full backup every 24 hours and retains 14 days.
- Restore is full-system only and requires explicit confirmation.

Add tests for report query helpers, error log API, and backup retention logic.
Use mocked database/storage boundaries for backup tests.

Run pnpm test:ci and bump APP_VERSION once.
```

## Prompt 15 — End-To-End Hardening

```text
Add final integration and E2E-style coverage for the MVP workflow.

Cover:
1. Blue Train enquiry to quote sent.
2. Rovos Rail enquiry to voucher sent.
3. Cancellation and refund.

Verify:
- Correct BT/RR booking numbers.
- Enquiry parsing and review behavior.
- Customer matching.
- Ownership and Start Quote.
- Quote generation and acceptance.
- Deposit invoice and payment capture.
- Final payment and voucher gate.
- Voucher Sent updates customer travel dates.
- Cancellation requires reason and stores refund details.
- Audit logs exist for major workflow events.

Prefer deterministic integration tests with mocked email/PDF/storage.
Do not hit live Supabase or real email services.

Run:
- pnpm test:ci
- pnpm build
- pnpm app:version:bump once
```

These prompts intentionally start with tests and keep each implementation connected to an existing route, UI surface, workflow, or persisted behavior. That should prevent the classic “nice module, no one calls it” problem.