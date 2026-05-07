# Luxus Sales System High-Value Prompt Pack

Last updated: 2026-05-05

This file replaces the old broad implementation prompt plan as the practical prompt pack to use now. The original plan was useful at the start of the build, but the app has already implemented a lot of it. These prompts focus only on remaining gaps that should materially improve the source code, product reliability, and business workflow.

## How To Use These Prompts

Use one prompt at a time. Each prompt should result in a small, reviewable implementation slice with tests. Do not ask an agent to run the full original plan from start to finish, because that risks rebuilding features that already exist.

Before each implementation prompt, tell the agent:

```md
Read AGENTS.md first and follow it exactly. Use `bookings` as the canonical job card entity unless a deliberate migration plan is requested. Do not rename tables or domain concepts casually. Add or update tests before changing behavior where the behavior is risky or under-specified. Use `pnpm` only. If you make code changes, bump `APP_VERSION` exactly once with `pnpm app:version:bump` before finishing.
```

After each prompt, ask for:

```md
Summarize changed files, tests run, any migrations added, and any remaining risks or follow-up work.
```

## Prompt 1: Production API And Security Hardening

Value: Very high. This reduces the chance of data leaks, broken role boundaries, weak validation, and inconsistent production behavior.

Use this first if you want the strongest foundation before adding more workflow features.

```md
Audit and harden the current Next.js API routes against AGENTS.md.

Scope:
- Inspect `app/api/**/*.ts`.
- Find routes that do not authenticate first with `createSessionClient()` and `supabase.auth.getUser()`.
- Find routes that do not validate external input with Zod.
- Find manager/admin actions that do not check `profiles.clearance_level`.
- Find inconsistent error responses that should use `{ error, details? }`.
- Find accidental `select('*')` usage in production API code and replace with explicit column lists where practical.
- Pay special attention to quotes, payments, correspondence, documents, settings, suppliers, packages, and customer import routes.

Implementation requirements:
- Add or update tests for any route behavior you change.
- Preserve existing business behavior unless it is clearly insecure or broken.
- Use `createServiceClient()` only where RLS bypass is intentional and server-only.
- Do not expose stack traces or infrastructure details to clients.
- Keep changes small and grouped by concern.

Acceptance criteria:
- All changed API routes authenticate, authorize, validate, and return consistent errors.
- Permission failures return 403, unauthenticated requests return 401, validation failures return 400.
- Relevant tests cover success, unauthenticated, forbidden, and invalid-input paths.
- `pnpm test:ci` passes.
```

## Prompt 2: Company Scoping Decision And Implementation Plan

Value: Very high if the system must ever support multiple companies, branches, brands, or hidden tenant boundaries. Lower value if Luxus will remain permanently single-company.

Use this before building more cross-cutting workflows if multi-company support is still a real requirement.

```md
Audit hidden company scoping and produce an implementation plan, then implement only the safest first slice.

Context:
- The app may need hidden company scoping across customers, bookings, quotes, invoices, payments, suppliers, settings, documents, and audit logs.
- Do not invent visible UI for company switching unless explicitly requested.
- Keep `bookings` as the canonical job card entity.

Audit:
- Identify all tables that should likely carry `company_id`.
- Identify API routes and queries that would need company filtering.
- Identify settings that are global today but should become company-scoped.
- Identify audit-log entries that should include company context.
- Identify migration risks and backfill requirements for existing data.

First implementation slice:
- If no company model exists, create the smallest safe foundation: company table, default company seed/backfill, profile/company relation, and helper functions for resolving the current user's company.
- Add RLS-friendly patterns without breaking the current single-company app.
- Update only one or two low-risk read/write flows end-to-end to prove the pattern.

Acceptance criteria:
- There is a clear written decision record for whether company scoping is being implemented now or deferred.
- If implemented, existing data is safely backfilled to a default company.
- New helper code is tested.
- No route leaks data across company boundaries in the implemented slice.
- `pnpm test:ci` passes.
```

## Prompt 3: Quote Lifecycle Completion

Value: Very high. Quotes are a central sales workflow and several pieces are still more prototype-like than production-grade.

Use this after API hardening, or immediately if quote sending is the next business priority.

```md
Complete the quote lifecycle around the current `bookings` model.

Scope:
- Keep quotes attached to bookings.
- Implement or harden quote numbering and versioning, using the business format such as `BT-2026-0001-Q1`.
- Enforce 14-day quote validity consistently.
- Add quote status transitions such as draft, sent, accepted, expired, superseded, and cancelled where missing.
- Persist quote totals and line items in a way that can be audited later.
- Generate a quote PDF or durable quote document record rather than only transient UI/email content.
- Add an acceptance link flow with a secure token, expiry, and audit logging.
- On quote acceptance, create or prepare the deposit invoice according to the 25% default deposit rule.

Implementation requirements:
- Add Zod validation at API boundaries.
- Add database constraints or indexes where they prevent duplicate quote numbers or invalid state.
- Add audit-log entries for quote sent, quote version created, quote accepted, quote cancelled, and manual override.
- Do not bypass the existing pipeline validation rules.
- Keep the UI consistent with existing quote/job card tabs.

Acceptance criteria:
- A user can create/send a versioned quote from a booking.
- A quote has a stable number, validity date, status, totals, and audit history.
- Accepting a quote records acceptance and creates or triggers the deposit invoice step.
- Expired or superseded quotes cannot be accepted.
- Tests cover numbering, versioning, validity, acceptance, and rejection cases.
- `pnpm test:ci` passes.
```

## Prompt 4: Invoice And Payment Lifecycle Completion

Value: Very high. This protects revenue workflow correctness and prevents bookings from moving forward without the right payment state.

Use this after or alongside quote lifecycle completion.

```md
Complete deposit/final invoice and payment handling for the booking workflow.

Scope:
- Generate deposit invoices from accepted quotes using the default 25% deposit unless overridden with an audited reason.
- Generate final invoices for remaining balance.
- Capture manual payments with amount, date, method, reference, notes, and optional proof upload.
- Calculate invoice totals, paid totals, outstanding balances, and booking-level `invoice_balance`.
- Gate booking confirmation on `deposit_paid = true`.
- Gate voucher generation on `invoice_balance = 0`.
- Add overdue flags and reminder-ready metadata for unpaid invoices.

Implementation requirements:
- Harden `app/api/payments` and related invoice routes with auth, role checks, and Zod.
- Store payment proof files in Supabase Storage or an existing document mechanism.
- Add audit logging for invoice generation, payment capture, proof upload, payment edit/delete, and manual overrides.
- Avoid live payment provider assumptions unless explicitly requested; this is manual payment capture for now.
- Keep calculations deterministic and tested.

Acceptance criteria:
- Deposit and final invoices can be generated and viewed from the job card.
- Manual payments update balances correctly.
- Booking confirmation is blocked until deposit is paid.
- Voucher generation is blocked until balance is zero.
- Overdue invoice state can be derived or displayed.
- Tests cover partial payments, overpayments, duplicate references where relevant, proof uploads, and permission failures.
- `pnpm test:ci` passes.
```

## Prompt 5: Voucher Lifecycle Completion

Value: High. Voucher generation appears partly implemented, but the remaining gaps affect customer-facing output and final workflow confidence.

Use this after invoice/payment gates are reliable.

```md
Complete voucher generation, sending, storage, and audit history.

Scope:
- Keep the existing modular voucher service-block concept where it fits.
- Block voucher generation until required booking fields are complete and `invoice_balance = 0`.
- Generate a durable voucher PDF or stored document record.
- Send voucher email with the correct customer summary and attachment/link.
- Update booking pipeline stage to Voucher Sent when successfully sent.
- Update customer first/last travel dates when voucher is sent.
- Record audit history for voucher generated, voucher sent, voucher regenerated, and blocked generation attempts.

Implementation requirements:
- Use existing document/template code where possible.
- Add a server-side validation function for voucher readiness so UI and API use the same rules.
- Make failed voucher generation or email sending visible in the job card.
- Add tests for readiness gates and customer travel-date updates.
- Do not allow UI-only checks to be the source of truth.

Acceptance criteria:
- Voucher cannot be generated with missing required fields or outstanding balance.
- Voucher output is persisted and recoverable.
- Sending the voucher records correspondence/audit history.
- Customer travel dates update only after successful voucher send.
- Tests cover ready, blocked, send success, send failure, and regeneration cases.
- `pnpm test:ci` passes.
```

## Prompt 6: Ownership, Assignment, And Pipeline Reliability

Value: Medium-high. Pipeline validation is already strong, but ownership/release/reassignment and audit visibility still need a more intentional workflow.

Use this if the team needs tighter operational control over who owns each enquiry/job card.

```md
Harden booking ownership and pipeline workflow.

Scope:
- Audit the current use of `owner_user_id`, `consultant`, assigned users, and any UI labels.
- Decide the canonical ownership field and document the decision in code comments or a short internal note.
- Implement ownership actions: assign, reassign, release, and claim.
- Ensure New Enquiries can be claimed before quote work begins.
- Implement or refine a clear Start Quote action that moves an enquiry into the active quote workflow only when review gates pass.
- Enforce pipeline transition rules server-side.
- Make audit history visible and reliable on the job card.

Implementation requirements:
- Keep `bookings` as the canonical job card.
- Do not break existing pipeline stages.
- Add role rules for reassignment and release where required.
- Add audit-log entries for ownership and stage changes.
- Add tests for allowed and blocked ownership transitions.

Acceptance criteria:
- Users can claim, release, and reassign bookings according to role rules.
- Imported enquiries land in New Enquiries and cannot skip review gates.
- Start Quote is blocked until required fields are complete.
- Pipeline moves are enforced by server-side validation, not only the UI.
- Audit history clearly shows who changed ownership/stage and when.
- `pnpm test:ci` passes.
```

## Prompt 7: CRM Completion Around Repeat Clients

Value: Medium-high. Useful for sales context and repeat-business handling, but it depends on voucher/payment workflows being reliable.

Use this after voucher sending is reliable, or earlier if customer data quality is the priority.

```md
Complete CRM behavior for customer matching, repeat-client state, profile fields, and booking history.

Scope:
- Ensure imported enquiries and manual bookings match customers by normalized email.
- Prevent duplicate customers where the same email already exists.
- Track repeat-client state based on booking history or explicit customer metadata.
- Add or wire profile fields needed by the business, such as title, province, birthday, VIP status, preferences, notes, passport/identity fields if already required by the spec, and communication preferences.
- Show booking history on customer profiles.
- Update first and last travel dates when voucher is successfully sent.

Implementation requirements:
- Do not store sensitive identity data unless there is already a clear product requirement and suitable access control.
- Add tests for email normalization, matching, duplicate prevention, and travel-date updates.
- Keep customer updates audited where they affect sales or compliance workflows.

Acceptance criteria:
- Customer matching by email is deterministic.
- Duplicate customers are prevented or clearly surfaced for merge/review.
- Repeat-client state is visible and correct.
- Customer profile shows useful booking history.
- Voucher send updates first/last travel dates.
- `pnpm test:ci` passes.
```

## Prompt 8: Pricing Engine And Override Audit

Value: Medium-high. Supplier and rate management are already advanced, so focus on calculation correctness and auditability rather than rebuilding the vocabulary.

Use this before quote calculation if pricing inconsistencies are causing manual work.

```md
Harden pricing calculation and override audit around existing suppliers, routes, services, rate cards, package legs, and booking suites.

Scope:
- Audit existing supplier categories/kinds, route/service/rate-card management, package pricing, and booking suite data.
- Prevent overlapping rates at the database and/or API layer where not already enforced.
- Implement or harden component pricing and fixed package pricing.
- Apply markup rules consistently.
- Apply supplements, including single supplements where configured.
- Apply child/infant pricing where configured.
- Record manual pricing overrides with old value, new value, reason, user, and timestamp.

Implementation requirements:
- Prefer a dedicated pricing calculation module with deterministic unit tests.
- Do not spread calculation logic across UI components.
- Keep existing supplier screens and data model unless a migration is clearly justified.
- Add tests with concrete Blue Train/Rovos examples where possible.

Acceptance criteria:
- Quote totals are reproducible from persisted booking/pricing inputs.
- Overlapping rates are prevented or surfaced clearly.
- Markups, supplements, child/infant rates, and fixed packages calculate correctly.
- Manual overrides are audited.
- `pnpm test:ci` passes.
```

## Prompt 9: End-To-End Workflow Test Coverage

Value: High once the major workflows above are implemented. This gives confidence that the whole lifecycle still works after future changes.

Use this as the final hardening prompt after quote, invoice/payment, and voucher workflows are implemented.

```md
Add high-value workflow tests for the full Luxus booking lifecycle.

Target workflow:
New Enquiry -> Quote Sent -> Quote Accepted -> Deposit Invoice Sent -> Deposit Paid -> Booking Made -> Final Invoice Sent -> Paid in Full -> Voucher Sent -> Closed

Scope:
- Test imported enquiry review gates.
- Test duplicate detection behavior.
- Test Start Quote and quote send.
- Test quote acceptance and deposit invoice creation.
- Test deposit paid gate for booking confirmation.
- Test final invoice and full payment balance calculation.
- Test voucher readiness, voucher send, customer travel-date update, and pipeline stage update.
- Test role/permission failures for sensitive actions.

Implementation requirements:
- Use deterministic unit/integration tests with mocked Supabase and network boundaries.
- Do not depend on live Supabase.
- Keep tests close to the modules/routes they exercise.
- Prefer testing shared domain functions directly where possible, then add route/component tests for important integration points.

Acceptance criteria:
- Tests cover the main happy path and important blocked paths.
- Future changes to quote, payment, voucher, or pipeline behavior fail loudly when they break the lifecycle.
- `pnpm test:ci` passes.
```

## Lower-Value Old Prompts To Avoid Running As-Is

These areas are not worthless, but the old prompts are too broad for the current app state:

- Full enquiry intake rebuild. Use only targeted parser fixtures and mailbox failure visibility work.
- Full supplier vocabulary rebuild. The supplier subsystem is already advanced; focus on pricing correctness and overlap protection.
- Full pipeline rebuild. Transition validation already exists; focus on ownership, Start Quote, outcome handling, and audit visibility.
- Full CRM rebuild. Focus on matching, duplicate prevention, repeat-client state, profile history, and travel dates.
- Reports/admin polish before quote/payment/voucher foundations are complete.

## Recommended Execution Order

1. Production API and security hardening.
2. Company scoping decision, if multi-company support still matters.
3. Quote lifecycle completion.
4. Invoice and payment lifecycle completion.
5. Voucher lifecycle completion.
6. Ownership, assignment, and pipeline reliability.
7. CRM completion around repeat clients.
8. Pricing engine and override audit.
9. End-to-end workflow test coverage.

If business delivery pressure is high, use this shorter order:

1. Quote lifecycle completion.
2. Invoice and payment lifecycle completion.
3. Voucher lifecycle completion.
4. End-to-end workflow test coverage.
5. Production API and security hardening.
