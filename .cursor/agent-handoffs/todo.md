# Luxus Sales System MVP Checklist

This checklist is based on `.cursor/agent-handoffs/spec.md` and the current repo state. The app already has a Next.js App Router foundation, Supabase integration, bookings as the primary job/enquiry entity, suppliers, packages, inbound email settings, pipeline pages, audit logs, and Vitest tests.

Use this as an implementation tracker. Prefer completing each section in order because later workflow steps depend on earlier gates, numbering, permissions, and data shape.

## Working Rules

- [x] Use `pnpm` only.
- [x] Keep App Router only; do not add Pages Router.
- [x] Keep roots as `app/`, `components/`, `lib/`, `hooks/`; do not add `src/`.
- [x] Prefer Server Components unless hooks, events, or browser APIs are needed.
- [x] Use `createSessionClient()` for normal server/API operations.
- [x] Use `createServiceClient()` only intentionally and server-side.
- [x] Verify server users with `supabase.auth.getUser()`.
- [x] Check `profiles.clearance_level` or JWT role for restricted operations.
- [x] Validate all API request bodies with Zod.
- [x] Return consistent API errors: `{ error: string, details?: unknown }`.
- [x] Use explicit Supabase column lists where practical.
- [x] Check every Supabase `error` before using `data`.
- [x] Do not expose service-role secrets to client code.
- [x] Do not commit `.env` files or secrets.
- [x] Add/adjust tests before implementing non-trivial behavior.
- [x] Run `pnpm test:ci` after each code chunk.
- [x] Run `pnpm build` for milestone chunks that touch app routing, build config, or shared types.
- [x] If code changes are made in a session, run `pnpm app:version:bump` exactly once before finishing.

## Phase 0: Current-State Audit

- [x] Compare `.cursor/agent-handoffs/spec.md` against current schema, APIs, UI pages, and tests.
- [x] Confirm canonical domain language for this repo.
- [x] Decide whether `bookings` remains the canonical job/enquiry entity.
- [x] List current tables that already satisfy spec concepts.
- [x] List missing columns/tables needed for MVP.
- [x] Identify legacy concepts that should stay only as compatibility aliases.
- [x] Identify duplicated or stale supplier/pricing code.
- [x] Confirm current auth flow and role mapping.
- [x] Confirm current pipeline stages and legacy stage aliases.
- [x] Confirm current inbound email flow and parser boundaries.
- [x] Confirm current quote, invoice, payment, document, and voucher capabilities.
- [x] Confirm current settings and audit log coverage.
- [x] Write a short gap report in project notes or a handoff doc.

## Phase 1: Foundation, Auth, Roles, And Company Scope

> **Decision (2026-05-13 — ADR-001):** Company scoping is permanently deferred. Luxus is and will remain single-company only. No `company_id` columns, no company table, no tenant-aware RLS. See `DECISIONS.md` for the full record.

- [x] Company scope decision recorded — single-company permanently. No `company_id` infrastructure. See `DECISIONS.md`.
- [x] RLS policies are role-based only (`admin`/`manager`/`consultant`/`readonly`) — correct for single-company. No changes needed.
- [x] Confirm user profile fields support:
  - [x] name
  - [x] surname
  - [x] email
  - [x] role / clearance level
  - [x] active status
  - ~~[x] company id~~ — **N/A: single-company (ADR-001)**
- [x] Confirm supported roles:
  - [x] Admin
  - [x] Manager
  - [x] Consultant
  - [x] Read-only
- [x] Add tests for role utility functions.
- [x] Add tests for settings access helpers.
- [x] Add tests for protected app layout behavior.
- [x] Confirm unauthenticated users redirect to `/login`.
- [x] Confirm invalid profile roles cannot access app routes.
- [x] Confirm inactive users are blocked if active-user enforcement exists.
- [x] Implement or verify Admin user management.
- [x] Implement or verify password reset/set-new-password flow.
- [x] Implement configurable session-timeout setting:
  - [x] 15 minutes
  - [x] 30 minutes
  - [x] 1 hour
  - [x] 2 hours
- [x] Add permission tests:
  - [x] Consultant cannot manage settings.
  - [x] Consultant cannot edit supplier rates.
  - [x] Manager can edit supplier rates.
  - [x] Admin can manage users.
  - [x] Read-only user cannot mutate data.

## Phase 2: Settings Shell

- [x] Confirm Settings page exists and is server-protected.
- [x] Add or complete Company Settings.
- [x] Add or complete Email Settings.
- [x] Add or complete Quote and Sales Settings.
- [x] Add or complete Payment Settings.
- [x] Add or complete Supplier and Pricing Settings.
- [x] Add or complete User and Security Settings.
- [x] Add or complete System Settings.
- [x] Persist settings in a typed settings table or current app settings model.
- [x] Add Zod schemas for settings API updates.
- [x] Add API tests for settings:
  - [x] unauthenticated returns `401`
  - [x] insufficient role returns `403`
  - [x] invalid body returns `400`
  - [x] valid update persists
  - [x] changes are audited
- [x] Add visible unresolved-error badge on Settings when error logging is complete.

## Phase 3: Audit Log Foundation

- [x] Confirm audit log table supports:
  - [x] actor/user
  - [x] entity type
  - [x] entity id
  - [x] action
  - [x] before JSON
  - [x] after JSON
  - [x] metadata JSON
  - [x] created timestamp
  - ~~[x] company id if applicable~~ — **N/A: single-company (ADR-001)**
- [x] Confirm audit log page is visible to all logged-in staff.
- [x] Confirm audit logs are read-only.
- [x] Confirm archive table or archival strategy exists.
- [x] Implement or verify 24-month active retention behavior.
- [x] Add tests for audit display formatting.
- [x] Add tests for audit export if export exists.
- [ ] Ensure these major workflow events are logged:
  - [x] ownership taken
  - [x] ownership released
  - [x] ownership reassigned
  - [x] pipeline status changed
  - [x] quote generated
  - [x] quote sent
  - [x] quote accepted
  - [x] deposit invoice sent
  - [x] deposit marked paid
  - [x] booking made / confirmed
  - [x] supplier reference captured
  - [x] invoice sent
  - [x] invoice marked paid
  - [x] voucher generated
  - [x] voucher sent
  - [x] attachment uploaded
- [ ] Ensure field changes are audited for:
  - [x] enquiry edits
  - [x] customer edits
  - [x] price changes
  - [x] quote edits
  - [x] payment edits
  - [x] supplier/rate edits
  - [x] settings changes

## Phase 4: Email Parser Hardening

- [x] Add parser fixtures for Blue Train SA-Rail emails.
- [x] Add parser fixtures for Rovos Rail SA-Rail emails.
- [x] Parse purpose of request.
- [x] Parse title.
- [x] Parse first name.
- [x] Parse surname.
- [x] Parse contact number.
- [x] Parse email address.
- [x] Parse country.
- [x] Parse province.
- [x] Parse train product.
- [x] Parse direction / route.
- [x] Parse departure date.
- [x] Parse number of adults.
- [x] Parse number of children.
- [x] Parse number of suites.
- [x] Parse suite type fields:
  - [x] Suite Type 1
  - [x] Suite Type 2
  - [x] Suite Type 3
  - [x] Suite Type 4
  - [x] Suite Type 5
  - [x] Suite Type 6
  - [x] Suite Type 7
  - [x] Suite Type 8
  - [x] Suite Type 9
  - [x] Suite Type 10
- [x] Parse Blue Train package option.
- [x] Parse complimentary hotel booking type.
- [x] Parse hotel option.
- [x] Parse flight booking required.
- [x] Parse flight route.
- [x] Parse flight departure date.
- [x] Parse additional travel services required.
- [x] Parse terms and conditions accepted.
- [x] Normalize purpose values:
  - [x] Quote
  - [x] Availability
  - [x] Reservation
- [x] Add parser edge-case tests:
  - [x] missing required field
  - [x] extra blank lines
  - [x] unexpected casing
  - [x] date with asterisk
  - [x] readable date formats
  - [x] duplicate labels
  - [x] unknown field
  - [x] same-line `Label: value`
  - [x] label on one line and value on next line
- [x] Keep parser output compatible with current inbound email import code.
- [x] Update `buildEnquiryImportPayload` if parser output expands.

## Phase 5: Inbound Email Accounts And Sync

- [x] Confirm mailbox settings support:
  - [x] display name
  - [x] email address
  - [x] IMAP host
  - [x] IMAP port
  - [x] username
  - [x] encrypted password/app password
  - [x] SSL/TLS mode
  - [x] active/inactive flag
  - [x] inbox folder
  - [x] processed folder
  - [x] needs review folder
  - [x] last successful sync timestamp
  - [x] last error
- [x] Confirm credentials are encrypted at rest.
- [x] Confirm password never leaves server routes.
- [x] Confirm daily cron route exists for email sync.
- [x] Confirm manual sync is Admin/Manager-only.
- [x] Confirm first sync scans a safe recent window.
- [x] Confirm later syncs use last seen UID.
- [x] Confirm `UIDVALIDITY` and IMAP UID are persisted.
- [x] Ensure exact duplicate message fetch is ignored.
- [x] Ensure duplicate ignores are logged as info/audit events.
- [x] Ensure unmatched email subjects are ignored without creating bookings.
- [x] Ensure matching emails create imported bookings.
- [x] Ensure complete imports move to Processed folder.
- [x] Ensure incomplete imports move to Needs Review folder.
- [x] Ensure folders are auto-created when supported.
- [x] Ensure filing failure does not delete or duplicate the created booking.
- [x] Ensure filing failure is exposed for staff follow-up.
- [x] Add mocked integration tests for:
  - [x] successful sync
  - [x] duplicate message
  - [x] parser failure
  - [x] mailbox connection failure
  - [x] filing/move failure
  - [x] needs-review import

## Phase 6: Enquiry Import Persistence

- [x] Confirm imported booking stores raw email text.
- [x] Confirm imported booking stores raw email preview safely.
- [x] Confirm imported booking stores subject.
- [x] Confirm imported booking stores mailbox email.
- [x] Confirm imported booking stores received timestamp.
- [x] Confirm imported booking stores missing fields.
- [x] Confirm imported booking stores warnings.
- [x] Confirm imported booking stores duplicate reference if suspected.
- [x] Confirm imported booking stores resolved route reference where possible.
- [x] Confirm imported booking stores package reference where possible.
- [x] Confirm imported booking stores hotel supplier reference where possible.
- [x] Store multiple suite types in child records.
- [x] Add tests for suite child-record creation.
- [x] Add tests for country normalization.
- [x] Add tests for fallback email behavior if no customer email exists.
- [x] Decide whether fallback email should be allowed by business rules.
- [x] Add visible warning if fallback email is used.

## Phase 7: New Enquiries Workflow

- [x] Confirm `/app/enquiries` exists.
- [x] Show imported enquiries before they enter active pipeline.
- [x] Exclude pre-pipeline enquiries from active Kanban board.
- [x] Add filters:
  - [x] Needs Review
  - [x] Complete
  - [x] Unassigned
  - [x] My enquiries
  - [x] Possible duplicates
- [x] Show missing fields on enquiry list.
- [x] Show warning count on enquiry list.
- [x] Show raw email preview safely.
- [x] Add enquiry detail/review experience.
- [x] Allow editing imported parsed fields.
- [x] Highlight missing required fields on job/enquiry card.
- [x] Add Take Ownership action.
- [x] Add Release Ownership action for current owner.
- [x] Add Admin/Manager reassignment action.
- [x] Add Start Quote action.
- [x] Block Start Quote when Needs Review is unresolved.
- [x] Block Start Quote when core contact fields are incomplete.
- [x] Audit ownership actions.
- [x] Audit Start Quote.
- [x] Add API tests for ownership:
  - [x] unauthenticated
  - [x] read-only forbidden
  - [x] consultant claim success
  - [x] release by owner success
  - [x] release by non-owner forbidden
  - [x] manager reassignment success
  - [x] invalid body rejected
- [x] Add API tests for Start Quote.
- [x] Add component tests for loading, empty, error, and success states.

## Phase 8: Job Numbering

- [x] Confirm current booking number generation behavior.
- [x] Migrate from global `LUX-YYYY-######` if still present.
- [x] Generate product prefix from parsed train product:
  - [x] Blue Train -> `BT`
  - [x] Rovos Rail -> `RR`
- [x] Generate format `BT-YYYY-0001`.
- [x] Generate format `RR-YYYY-0001`.
- [x] Reset sequences per product per year.
- [x] Ensure counters are concurrency-safe.
- [x] Ensure job number is created immediately at ingestion/job creation.
- [x] Add tests:
  - [x] Blue Train counter increments independently
  - [x] Rovos Rail counter increments independently
  - [x] counter resets by year
  - [x] concurrent creation cannot duplicate numbers
  - [x] unknown supplier fails safely or uses review fallback
- [x] Update UI labels from booking number/job number consistently.

## Phase 9: Customer CRM

- [x] Confirm customer fields:
  - [x] title
  - [x] first name
  - [x] surname
  - [x] email
  - [x] phone number
  - [x] country
  - [x] province
  - [x] birthday
  - [x] VIP flag
  - [x] preferences
  - [x] notes
  - [x] first travel date
  - [x] last travel date
- [x] Match inbound enquiry to existing customer by email only.
- [x] Create new customer if email does not exist.
- [x] Do not merge same-name different-email customers automatically.
- [x] Update existing customer contact fields carefully from new enquiry.
- [x] Preserve existing CRM notes/preferences during import updates.
- [x] Mark new booking as Repeat Client if customer has completed trip.
- [x] Define completed trip as booking reaching Voucher Sent.
- [x] Set first travel date on first completed trip.
- [x] Update last travel date on every completed trip.
- [x] Show customer booking history.
- [x] Show customer linked accounts if currently supported.
- [x] Add tests:
  - [x] existing email links customer
  - [x] new email creates customer
  - [x] same name different email creates new customer
  - [x] repeat client flag set
  - [x] first travel date set once
  - [x] last travel date updates
- [x] Add component coverage for customer loading, empty, error, success states.

## Phase 10: Pipeline And Stage Gates

- [x] Confirm canonical active pipeline stages:
  - [x] Quote Sent
  - [x] Quote Accepted
  - [x] Deposit Invoice Sent
  - [x] Deposit Paid
  - [x] Paid in Full
  - [x] Voucher Sent
- [x] Keep or map legacy stages safely:
  - [x] quoted
  - [x] form_done
  - [x] payment_schedule
  - [x] trip_active
- [x] Confirm `enquiry` is pre-pipeline.
- [x] Confirm `closed` is final completed state outside active board.
- [x] Confirm `lost` is outside active board.
- [x] Add transition validation tests for all allowed moves.
- [x] Add transition validation tests for blocked moves.
- [x] Block forward movement from Needs Review.
- [x] Block movement if core customer contact fields are incomplete.
- [x] Block Deposit Paid unless `deposit_paid = true`.
- [x] Block Voucher Sent unless `invoice_balance = 0`.
- [x] Block Voucher Sent unless required booking/customer fields are complete.
- [x] Log every transition in audit history.
- [x] Preserve stage timestamp fields:
  - [x] quote sent at
  - [x] accepted at
  - [x] deposit requested at
  - [x] deposit paid at
  - [x] final paid at
  - [x] voucher sent at
  - [x] closed at
- [x] Add pipeline API tests:
  - [x] unauthenticated
  - [x] read-only forbidden for mutation
  - [x] valid move
  - [x] invalid move
  - [x] review gate
  - [x] payment gate
  - [x] voucher gate
- [x] Add Kanban UI tests or manual checklist for drag/drop and keyboard access.

## Phase 11: Outcomes, Cancellation, And Refunds

- [x] Add or confirm outcome field:
  - [x] Open
  - [x] Won
  - [x] Lost
  - [x] Cancelled
- [x] Default outcome to Open.
- [x] Add outcome reason table/settings.
- [x] Require outcome reason for Lost.
- [x] Require outcome reason for Cancelled.
- [x] Include `Other` reason.
- [x] Require free text when reason is `Other`.
- [x] Allow Admin/Manager to manage reason dropdown options.
- [x] Do not implement Dormant outcome.
- [x] Do not implement automatic dormant/lost suggestions for MVP.
- [x] Implement cancellation dialog validation.
- [x] Store cancellation timestamp.
- [x] Store refund status.
- [x] Store refund amount.
- [x] Store refund method/reference.
- [x] Audit cancellation and refund events.
- [x] Add tests:
  - [x] lost requires reason
  - [x] cancelled requires reason
  - [x] other requires text
  - [ ] cancellation calculates refund where current rules exist
  - [ ] refund persistence
  - [x] audit created

## Phase 12: Supplier Management

- [x] Confirm supplier company record fields:
  - [x] name
  - [x] category/kind
  - [x] email
  - [x] phone
  - [x] website
  - [x] location
  - [x] notes
  - [x] active/status
  - ~~[x] company id~~ — **N/A: single-company (ADR-001)**
- [x] Confirm supplier categories/kinds:
  - [x] Train
  - [x] Hotel
  - [x] Transfers
  - [x] Tours
  - [x] Airlines
- [x] Restrict category/kind management to Admin/Manager.
- [x] Confirm suppliers can have multiple emails if current model supports it.
- [x] Confirm supplier detail page supports child records:
  - [x] products/services/routes
  - [x] suite/room/vehicle/cabin/tour types
  - [x] rates
  - [x] markup
  - [x] cancellation fee
- [x] Ensure prices are never stored directly on supplier company table.
- [x] Keep supplier save guards tested.
- [x] Keep supplier editor utilities tested.
- [x] Add permission tests:
  - [x] Consultant can view suppliers
  - [x] Consultant cannot manage rates
  - [x] Manager can manage rates
  - [x] Read-only can view but not mutate

## Phase 13: Supplier Products, Routes, And Pricing Options

- [x] Confirm shared supplier/service model supports all supplier kinds.
- [x] For train operators:
  - [x] route means Route
  - [x] pricing option means Suite Type
  - [x] origin and destination locations supported
- [x] For hotels:
  - [x] route/service means Meal Plan
  - [x] pricing option means Room Type
  - [x] rates are per room per night
- [x] For transfers:
  - [x] route/service means Service
  - [x] pricing option means Vehicle Type
  - [x] pickup/drop-off fields supported
  - [x] transfer/rental service type supported
- [x] For tours:
  - [x] route/service means Itinerary
  - [x] pricing option means Tour Type
- [x] For airlines:
  - [x] route means Route
  - [x] pricing option means Cabin
- [x] Confirm UI vocabulary changes correctly by supplier kind.
- [x] Add tests for supplier vocabulary labels.
- [x] Add route/service API tests.
- [x] Add pricing-option API tests.
- [x] Add component tests for supplier detail child forms if practical.

## Phase 14: Rate Cards

- [x] Confirm rate-card fields:
  - [x] route/service id
  - [x] pricing option id
  - [x] price per person or supplier-kind equivalent
  - [x] child price
  - [x] infant price
  - [x] currency
  - [x] valid from
  - [x] valid to
  - [x] created timestamp
  - ~~[x] company id if applicable~~ — **N/A: single-company (ADR-001)**
- [x] Support open-ended `valid_to`.
- [x] Select default rate by departure date.
- [x] Prevent overlapping rates for same route + pricing option + period.
- [x] Add database constraint or exclusion logic for overlap prevention.
- [x] Add API validation for overlaps.
- [x] Add tests:
  - [x] matching date inside range
  - [x] matching open-ended range
  - [x] date before range returns no rate
  - [x] date after closed range returns no rate
  - [x] overlap blocked
  - [x] adjacent non-overlap allowed
  - [x] different route can overlap
  - [x] different pricing option can overlap
- [x] Audit rate creates, edits, and deletes.

## Phase 15: Package Model

- [x] Confirm package fields:
  - [x] name
  - [x] slug
  - [x] description
  - [x] duration nights
  - [x] currency
  - [x] single supplement percentage
  - [x] fixed price per person
  - [x] active
  - ~~[x] company id~~ — **N/A: single-company (ADR-001)**
- [x] Confirm package legs exist.
- [x] Confirm each package leg links to supplier.
- [x] Confirm package leg routes/services exist.
- [x] Confirm package wizard can create multi-leg packages.
- [x] Confirm packages can include:
  - [x] train journey
  - [x] complimentary hotel stay
  - [x] selected extras
  - [x] flights as manual/optional service
  - [x] additional services as manual/optional service
- [x] Add tests for package wizard pricing helpers.
- [x] Add package apply tests.
- [x] Ensure applied package data flows into job/quote builder.

## Phase 16: Pricing Engine

- [x] Create or complete a pure pricing module.
- [x] Support pricing source `stored_package`.
- [x] Support pricing source `calculated_components`.
- [x] Calculate component total from selected package/rate-card components.
- [x] Apply supplier/product/package markup rules.
- [x] Apply single supplement.
- [x] Apply child price where configured.
- [x] Apply infant price where configured.
- [x] Treat children as manual adjustment when no configured rule exists.
- [x] Keep values VAT-inclusive.
- [x] Do not round calculated values.
- [x] Support consultant-selected rate override.
- [x] Require override reason if business wants it, or audit override metadata at minimum.
- [x] Audit manual rate override.
- [x] Add tests:
  - [x] fixed package price selected
  - [x] component price selected
  - [x] missing rate returns actionable error
  - [x] markup applied
  - [x] supplement applied
  - [x] child price applied
  - [x] infant price applied
  - [x] no rounding
  - [x] mixed-currency rejected or handled explicitly
- [x] Wire pricing result into quote builder.

## Phase 17: Quote Builder And Lifecycle

- [x] Confirm quote table supports:
  - ~~[ ] company id~~ — **N/A: single-company (ADR-001)**
  - [x] booking/job id
  - [x] quote number
  - [x] title
  - [x] status label
  - [x] pricing source
  - [x] subtotal
  - [x] deposit percentage
  - [x] deposit amount
  - [x] total
  - [x] amount received
  - [x] outstanding amount
  - [x] validity date
  - [x] PDF file id
  - [x] sent timestamp
  - [x] accepted timestamp
- [x] Confirm quote line item table supports:
  - [x] quote id
  - [x] description
  - [x] pax/quantity
  - [x] status
  - [x] per-person rate
  - [x] total
  - [x] display order
- [x] Quote title must be `PROVISIONAL QUOTATION`.
- [x] Quote status label must be `STATUS: Provisional`.
- [x] Quote validity must come from settings.
- [x] Default quote validity should be confirmed against spec/current app:
  - [x] spec overview says 14 days
  - [x] quote document section says default 30 days
  - [x] choose canonical setting and document decision
- [x] Generate quote number from booking number:
  - [x] `BT-YYYY-0001-Q1`
  - [x] `RR-YYYY-0001-Q1`
- [x] Increment quote version on meaningful resend changes.
- [x] Preserve previous quote versions.
- [x] Allow quote edits after sending.
- [x] Audit quote edits.
- [x] Add quote status flow:
  - [x] draft
  - [x] pricing incomplete
  - [x] ready
  - [x] sent
  - [x] accepted
- [x] Add tests:
  - [x] quote number versioning
  - [x] validity date
  - [x] line item totals
  - [x] deposit calculation
  - [x] edit after send
  - [x] version preserved
  - [x] audit created

## Phase 18: Quote PDF, Email, And Acceptance

- [x] Choose current PDF generation approach.
- [x] Generate formatted quote PDF.
- [x] Store generated quote PDF in storage/documents.
- [x] Create document record for quote PDF.
- [x] Build quote email summary template.
- [x] Attach quote PDF to quote email.
- [x] Send via existing email provider pattern.
- [x] Store correspondence record:
  - [x] booking id
  - [x] channel
  - [x] kind
  - [x] subject
  - [x] recipients
  - [x] sent timestamp
  - [x] status
  - [x] error if failed
- [x] Move booking to Quote Sent via transition validation.

> **Record correction (2026-05-27):** Acceptance is **internal-only**, not customer-facing. There is no tokenized acceptance link/page in the codebase. Moving a booking to the `accepted` stage flips the newest `sent` quote to `accepted` (`lib/pipeline/apply-transition.ts`). The deposit invoice is a **separate step** (`app/api/invoices/deposit/route.ts`, which requires an already-`accepted` quote) — it is **not** auto-created on acceptance. The items below were previously marked done in error.

- [ ] Create tokenized customer acceptance link. — **NOT built** (internal-only acceptance)
- [ ] Acceptance link must not require customer login. — **N/A** (no public link)
- [ ] Validate acceptance token. — **NOT built** (no token mechanism)
- [ ] Expired quote behavior must be explicit. — quote `validity_until` is stored, but no acceptance-time enforcement exists
- [x] Accepting quote records accepted timestamp. — via stage move (`accepted_at`)
- [x] Accepting quote moves booking to Quote Accepted. — via pipeline transition
- [ ] Accepting quote generates deposit invoice. — **separate manual step**, not auto-created on acceptance
- [x] Add tests with mocked PDF/email/storage:
  - [x] PDF generation success
  - [x] PDF generation failure logs error
  - [x] email send success
  - [x] email send failure logs error
  - [ ] acceptance token success — **NOT built** (no token mechanism)
  - [ ] invalid token rejected — **NOT built** (no token mechanism)
  - [x] internal acceptance + deposit invoice covered by route-level lifecycle E2E (`app/api/__tests__/booking-lifecycle.e2e.test.ts`)

## Phase 19: Invoices

- [x] Confirm invoice table supports:
  - ~~[x] company id~~ — **N/A: single-company (ADR-001)**
  - [x] booking/job id
  - [x] invoice number
  - [x] invoice type
  - [x] amount
  - [x] due date
  - [x] status
  - [x] PDF file id
  - [x] sent timestamp
  - [x] paid timestamp
- [x] Implement deposit invoice generation.
- [x] Implement final invoice generation.
- [x] Define invoice number format.
- [x] Add deterministic invoice numbering tests.
- [x] Use default deposit percentage of 25%.
- [x] Make deposit percentage configurable if settings require it.
- [x] Deposit due rule:
  - [x] configurable in settings
  - [x] editable per quote
  - [x] default direction must be confirmed: X days before departure vs X days after quote acceptance
- [x] Final payment default:
  - [x] configurable as X days before departure
  - [x] default number needs business confirmation
- [x] Generate invoice PDF.
- [x] Store invoice PDF document.
- [x] Send invoice email.
- [x] Store correspondence record.
- [x] Audit invoice generated/sent/paid.
- [x] Add tests:
  - [x] deposit invoice amount
  - [x] final invoice amount
  - [x] invoice due date setting
  - [x] invoice numbering
  - [x] invoice PDF failure logs error
  - [x] invoice send failure logs error

## Phase 20: Payments

- [x] Confirm payment table supports:
  - ~~[ ] company id~~ — **N/A: single-company (ADR-001)**
  - [x] booking/job id
  - [x] invoice id
  - [x] amount
  - [x] payment date
  - [x] reference number
  - [x] payment method
  - [x] proof file id
  - [x] captured by user id
  - [x] created/updated timestamps
- [x] Implement manual payment capture.
- [x] Require payment amount.
- [x] Require payment date.
- [x] Require payment method.
- [x] Require reference number if business requires it.
- [x] Upload proof of payment.
- [x] Store proof as attachment/document.
- [x] Recalculate invoice balance.
- [x] Set deposit paid when payments meet deposit invoice amount.
- [x] Set paid in full when payments meet total invoice amount.
- [x] Prevent booking confirmation without deposit paid.
- [x] Add payment method dropdown.
- [x] Add overdue payment flag.
- [x] Add payment reminder settings.
- [x] Add payment reminder worker.
- [x] Audit payment creates/edits/deletes.
- [x] Add tests:
  - [x] required fields enforced
  - [x] proof upload mocked
  - [x] partial payment leaves balance
  - [x] deposit payment sets deposit paid
  - [x] full payment sets balance zero
  - [x] overpayment behavior explicit
  - [x] refund/negative payment behavior explicit
  - [x] reminder due
  - [x] reminder skipped after paid

## Phase 21: Attachments And Documents

- [x] Confirm attachment table supports:
  - ~~[ ] company id~~ — **N/A: single-company (ADR-001)**
  - [x] booking/job id
  - [x] file name
  - [x] file type/kind
  - [x] file URL/blob ref
  - [x] uploaded by user id
  - [x] created timestamp
- [x] Confirm document kinds:
  - [x] quote PDF
  - [x] invoice PDF
  - [x] voucher PDF
  - [x] summary PDF
  - [x] other
- [x] Implement proof-of-payment upload/read/delete API with signed URL access.
- [x] Add proof-of-payment upload validation and mocked storage tests.
- [x] Implement general safe upload API.
- [x] Restrict general upload to authenticated users.
- [x] Enforce general file size/type rules.
- [x] Store general files in Supabase Storage or current chosen storage.
- [x] Do not expose private storage paths without signed URLs if private.
- [x] Add tests for general upload validation.
- [x] Add mocked storage tests for general uploads.
- [x] Add UI states for document list:
  - [x] loading
  - [x] empty
  - [x] error
  - [x] success

## Phase 22: Voucher Generation

- [x] Confirm voucher table supports:
  - ~~[ ] company id~~ — **N/A: single-company (ADR-001)**
  - [x] booking/job id
  - [x] voucher number
  - [x] PDF file id
  - [x] generated timestamp
  - [x] sent timestamp
  - [x] created by user id
- [x] Confirm voucher service block table supports:
  - [x] voucher id
  - [x] service type
  - [x] supplier id
  - [x] title
  - [x] supplier reference
  - [x] contact details
  - [x] service data JSON
  - [x] display order
- [x] Generate deterministic voucher number.
- [x] Build modular voucher service blocks for:
  - [x] train
  - [x] hotel
  - [x] transfer
  - [x] tour
  - [x] airline/flight
  - [x] additional service
- [x] Include supplier references in blocks.
- [x] Include supplier contact details in blocks.
- [x] Use uploaded voucher document as design inspiration if available.
- [x] Keep voucher implementation modular rather than hard-coded one-off layout.
- [x] Generate voucher PDF.
- [x] Store voucher PDF document.
- [x] Audit voucher generated.
- [x] Add tests:
  - [x] voucher number generation
  - [x] service block order
  - [x] supplier details render
  - [x] missing supplier reference handled
  - [x] PDF generation failure logs error

## Phase 23: Voucher Gates And Sending

- [x] Block voucher generation if invoice balance is not zero.
- [x] Block voucher generation if required booking fields are incomplete.
- [x] Block voucher generation if required customer fields are incomplete.
- [x] Block voucher sending if invoice balance is not zero.
- [x] Block voucher sending if required fields are incomplete.
- [x] Send voucher email with PDF attachment.
- [x] Store voucher correspondence record.
- [x] Audit voucher sent.
- [x] Move booking to Voucher Sent through transition validation.
- [x] Update customer first/last travel dates on Voucher Sent.
- [x] Add tests:
  - [x] balance gate
  - [x] required-field gate
  - [x] send success
  - [x] send failure logs error
  - [x] stage transition
  - [x] customer travel dates update

## Phase 24: Follow-Up Worker

- [x] Add quote follow-up settings:
  - [x] enabled by default or configurable
  - [x] schedule intervals
  - [x] templates
- [x] Find quote follow-ups due.
- [x] Send follow-up email if enabled.
- [x] Stop follow-ups if job progressed.
- [x] Stop follow-ups if disabled for job.
- [x] Log skipped follow-ups as info where useful.
- [x] Store correspondence records.
- [x] Add tests:
  - [x] follow-up due
  - [x] disabled follow-up skipped
  - [x] progressed job skipped
  - [x] email failure logs error

## Phase 25: Error Logging

- [x] Confirm error log table supports:
  - ~~[x] company id~~ — **N/A: single-company (ADR-001)**
  - [x] severity
  - [x] source
  - [x] message
  - [x] details JSON
  - [x] resolved flag
  - [x] resolved by user id
  - [x] resolved timestamp
  - [x] created timestamp
- [x] Support severities:
  - [x] Critical
  - [x] Warning
  - [x] Info
- [x] Log critical errors:
  - [x] mailbox cannot connect
  - [x] email sync failed
  - [x] quote PDF generation failed
  - [x] invoice generation failed
  - [x] voucher generation failed
  - [x] backup failed
  - [x] restore failed
- [x] Log warning errors:
  - [ ] required field missing — no dedicated console.error site; captured via sync summary
  - [ ] date could not be parsed — no dedicated console.error site; captured via sync summary
  - [ ] rate not found — no dedicated console.error site; captured via sync summary
  - [ ] duplicate email detected — logged as Info (duplicate ignored) rather than Warning
  - [x] email moved to processed folder failed
  - [x] email sent but timeline update failed
- [x] Log info events:
  - [x] duplicate ignored
  - [x] follow-up skipped because job progressed
  - [x] reminder skipped because payment already marked paid
- [x] Add Settings error-log page.
- [x] Add unresolved error badge on Settings nav.
- [x] Allow users to mark errors resolved.
- [x] No resolution note required for MVP.
- [x] Add tests:
  - [x] create error log helper
  - [x] list unresolved
  - [x] badge count
  - [x] resolve success
  - [x] unauthenticated resolve rejected
  - [x] read-only resolve permission decision tested

## Phase 26: Backup And Restore

- [x] Decide local/production backup mechanism.
- [x] Create automatic backup worker route/job.
- [x] Run automatic backup every 24 hours.
- [x] Store backups securely.
- [x] Retain backups for 14 days.
- [x] Delete backups older than 14 days.
- [x] Add Settings Backup and Restore UI.
- [x] List available backups.
- [x] Implement full restore only.
- [x] Require Admin/Manager permission for restore.
- [x] Show restore warning:
  - [x] entire database will roll back
  - [x] changes after selected backup will be lost
  - [x] user must confirm
- [x] Do not implement selective restore in MVP.
- [x] Log backup failures as Critical.
- [x] Log restore failures as Critical.
- [x] Audit successful restore.
- [x] Add mocked tests:
  - [x] backup created
  - [x] backup retention deletes old backups
  - [x] restore requires confirmation
  - [x] restore permission enforced
  - [x] backup failure logs error

## Phase 27: Dashboard And Reports

- [x] Confirm dashboard shows active pipeline.
- [x] Add dashboard summary metrics:
  - [x] new enquiries
  - [x] active quotes
  - [x] accepted quotes
  - [x] deposit invoices sent
  - [x] deposits paid
  - [x] paid in full
  - [x] vouchers sent
  - [x] unresolved errors
- [x] Add filters:
  - [x] consultant
  - [x] product
  - [x] date range
  - [x] status/stage
- [x] Add reports:
  - [x] sales per salesperson
  - [x] conversion rate
  - [x] revenue per product
  - [x] outstanding payments
  - [x] new enquiries by source/mailbox
- [x] Add CSV export.
- [ ] Add PDF export only if existing PDF tooling supports it cleanly. — **deferred**: tabular-only data does not benefit meaningfully from PDF; CSV export covers all reports.
- [x] Ensure export permission rules are explicit.
- [x] Add tests for report query helpers.
- [x] Add tests for export authorization.
- [x] Add UI states for report pages:
  - [x] loading
  - [x] empty
  - [x] error (SWR surfaces errors; reports return 500 with message)
  - [x] success

## Phase 28: Required UI Pages

- [x] Login page complete.
- [x] Dashboard page complete.
- [x] New Enquiries page complete.
- [x] Pipeline board complete.
- [x] Job/Booking card complete.
- [x] Customers list/search complete.
- [x] Customer detail/profile complete.
- [x] Suppliers list complete.
- [x] Supplier detail complete.
- [x] Packages/products page complete.
- [x] Quotes page complete.
- [x] Payments page complete.
- [x] Documents page complete.
- [x] Correspondence page complete.
- [x] Reports page complete.
- [x] Settings page complete.
- [x] Audit log page complete.
- [x] Audit archive page complete if archival exists.
- [x] Error log page complete.
- [x] Backup/restore page complete.

## Phase 29: Job/Booking Card Sections

- [ ] Header with:
  - [x] job/booking number
  - [x] owner
  - [x] status/stage
  - [x] outcome
  - [x] purpose label
  - [x] repeat client flag
- [x] Customer info section.
- [x] Enquiry details section.
- [x] Missing required fields warning.
- [x] Quote section.
- [x] Invoice section.
- [x] Payment section.
- [x] Voucher section.
- [x] Attachments section.
- [x] Internal notes section.
- [x] Timeline/correspondence section.
- [x] Audit log section.
- [x] Loading state.
- [x] Empty state where relevant.
- [x] Error state.
- [x] Success state.
- [x] Keyboard-accessible actions.
- [x] Visible hover/focus/disabled states.

## Phase 30: Security Review

- [x] Search for accidental client imports of `createServiceClient`.
- [x] Search for `SUPABASE_SERVICE_ROLE_KEY` exposure outside server-only code.
- [x] Search for `select("*")` in production code and replace where practical.
- [x] Search for `any` in changed files.
- [x] Search for `@ts-ignore`.
- [x] Search for API routes without auth checks.
- [x] Search for API routes without Zod validation on mutation.
- [x] Search for routes returning raw stack traces.
- [x] Confirm read-only user cannot mutate:
  - [x] customers
  - [x] bookings/jobs
  - [x] quotes
  - [x] payments
  - [x] suppliers
  - [x] packages
  - [x] settings
  - [x] documents
  - [x] exports
- [x] Confirm Consultant cannot manage:
  - [x] users
  - [x] global settings
  - [x] supplier categories
  - [x] supplier rates
- [x] Confirm Manager/Admin can manage operational settings as intended.
- [x] Confirm Admin-only settings are protected.

## Phase 31: Test Suite Completion

- [x] Parser unit tests complete.
- [x] Job/booking number tests complete.
- [x] Customer matching tests complete.
- [x] Pricing tests complete.
- [x] Quote tests complete.
- [x] Invoice tests complete.
- [x] Payment tests complete.
- [x] Voucher tests complete.
- [x] Permission tests complete.
- [x] Email ingestion integration tests complete.
- [x] Email sending tests complete.
- [x] File storage tests complete.
- [x] Backup and restore tests complete.
- [ ] Error logging tests complete.
- [x] Pipeline transition tests complete.
- [x] Supplier/rate tests complete.
- [x] Reporting tests complete.
- [x] Run `pnpm test:ci`. — 2026-05-29: 107 files / 673 tests passing.
- [x] Run `pnpm test:coverage`. — 2026-05-27: project 63.9% stmts / 50.9% branch (provider `@vitest/coverage-v8` added). Lifecycle modules well covered: lib/pipeline 86.8%, lib/invoices 88.9%, lib/voucher 100%, app/api/payments 95.8%, app/api/quotes 87.8%, app/api/pipeline 80%.
- [ ] Review coverage gaps for high-risk workflow logic. — known low areas (non-lifecycle): app/api/jobs/[id] 7.5%, app/api/enquiries 18.8%, app/api/users 36.7%. No CI coverage threshold gate added (report-only).

> **Prompt 9 — End-to-end workflow test coverage (2026-05-27, verified passing):**
> - Added `app/api/jobs/[id]/start-quote/route.test.ts` — Start Quote gates (customer-complete, email-import review), happy-path draft-quote creation, quote-number versioning, and 401/403/404 failures.
> - Added duplicate-detection cases to `lib/inbound-email/import-booking.test.ts` — flags + audits `possible_duplicate_email_import` for a recent same-email booking, and leaves it unset when there is no match.
> - Existing `lib/pipeline/__tests__/booking-lifecycle.workflow.test.ts` already covers the domain happy path enquiry→closed, payment-derived balance/deposit state, voucher readiness, and the voucher-sent/closed side effects (customer travel-date update + stage move). No `booking_made` enum: supplier booking is the `deposit_paid` stage + suppliers tab (per AGENTS.md).

> **Test-hardening follow-up (2026-05-27, verified passing):**
> - Added reusable in-memory Supabase test double `lib/testing/supabase-mock.ts` (+ its own tests) so route tests stop hand-rolling bespoke chainable mocks.
> - Added route-level lifecycle E2E `app/api/__tests__/booking-lifecycle.e2e.test.ts` — drives the **real** start-quote, quotes, deposit-invoice and payments handlers against one shared store (enquiry→quote→accepted→deposit invoice→deposit paid→paid in full→voucher sent→closed), plus blocked-path + permission assertions.
> - Refactored `start-quote` and `invoices/deposit` route tests onto the shared double.
> - Added the one genuinely-uncovered `apply-transition` branch test (invoice_balance backfill). The `accepted` quote-flip and `deposit_requested` invoice-doc/correspondence branches were already covered by `lib/pipeline/__tests__/apply-transition.test.ts`.
> - **Pre-existing concern (not introduced here):** `pnpm typecheck` reports 4 errors in `lib/quotes/pricing-engine.test.ts` (open-ended `validTo: string | null` vs a local type expecting `string`). Vitest does not type-check, so tests stay green, but `pnpm build` would fail. Left unfixed — unrelated to lifecycle scope.

## Phase 32: End-To-End MVP Scenarios

- [ ] E2E Scenario 1: Blue Train enquiry to quote.
  - [ ] Receive Blue Train email.
  - [ ] Parse fields.
  - [ ] Create customer.
  - [ ] Create booking/job number starting with `BT`.
  - [ ] Consultant claims job.
  - [ ] Consultant resolves review if required.
  - [ ] Consultant starts quote.
  - [ ] Booking enters pipeline.
  - [ ] Consultant generates quote.
  - [ ] Consultant sends quote.
  - [ ] Quote PDF generated.
  - [ ] Email/correspondence timeline created.
  - [ ] Audit log created.
- [ ] E2E Scenario 2: Rovos enquiry to voucher.
  - [ ] Receive Rovos email.
  - [ ] Parse enquiry.
  - [ ] Create booking/job number starting with `RR`.
  - [ ] Generate quote.
  - [ ] Send quote.
  - [ ] Customer accepts quote.
  - [ ] Deposit invoice generated.
  - [ ] Consultant records deposit payment.
  - [ ] Consultant generates final invoice.
  - [ ] Consultant marks invoice paid / records final payment.
  - [ ] Voucher generation gate passes.
  - [ ] Consultant generates voucher.
  - [ ] Consultant sends voucher.
  - [ ] Booking reaches Voucher Sent.
  - [ ] Customer last travel date updates.
  - [ ] Repeat client rule works on future enquiry.
  - [ ] Voucher contains modular service blocks.
- [ ] E2E Scenario 3: Cancellation and refund.
  - [ ] Quote accepted.
  - [ ] Consultant cancels booking.
  - [ ] Cancellation reason required.
  - [ ] Other reason requires text.
  - [ ] System calculates/stores cancellation fee if rule exists.
  - [ ] System calculates/stores refund.
  - [ ] Consultant records refund.
  - [ ] Outcome set to Cancelled.
  - [ ] Audit log complete.

## Phase 33: User Acceptance Testing

- [ ] Consultant UAT:
  - [ ] Can find new enquiries.
  - [ ] Can claim jobs.
  - [ ] Can release own claimed jobs.
  - [ ] Can start quote.
  - [ ] Can edit missing fields.
  - [ ] Can generate quote.
  - [ ] Can send quote email.
  - [ ] Can record payment.
  - [ ] Can upload proof of payment.
  - [ ] Can generate voucher when gates pass.
  - [ ] Cannot generate voucher when gates fail.
- [ ] Manager UAT:
  - [ ] Can edit templates.
  - [ ] Can manage suppliers.
  - [ ] Can manage rates.
  - [ ] Can view reports.
  - [ ] Can reassign jobs.
  - [ ] Can resolve errors.
- [ ] Admin UAT:
  - [ ] Can create users.
  - [ ] Can configure company details.
  - [ ] Can configure email accounts.
  - [ ] Can configure backup/restore.
  - [ ] Can restore from backup.
  - [ ] Can manage global settings.
- [ ] Read-only UAT:
  - [ ] Can view allowed pages.
  - [ ] Cannot create, edit, delete, send, export, or manage settings/users.

## Phase 34: Open Business Decisions

- [x] Confirm quote validity default:
  - [x] 14 days from project overview, or
  - [x] 30 days from quote document section.
- [x] Confirm deposit due rule:
  - [x] X days before departure, or
  - [x] X days after quote acceptance.
- [x] Confirm recommended default for deposit due date.
- [x] Confirm final payment default days before departure.
- [x] Confirm outbound email provider:
  - [x] incoming server name
  - [x] outgoing server name
  - [x] Outlook Web availability
  - [x] Microsoft 365 Exchange Online status
  - [x] SMTP credentials/app password availability
- [x] Confirm voucher visual reference document location.
- [x] Confirm backup storage location for production.
- [x] Confirm whether read-only users may export reports.
- [x] Confirm whether payment reference number is mandatory.
- [x] Confirm whether quote acceptance after validity date is allowed.

## Phase 35: Final Release Readiness

- [ ] All MVP checklist items either complete or explicitly deferred.
- [x] No known secrets committed.
- [ ] `pnpm test:ci` passes.
- [ ] `pnpm build` passes.
- [ ] Database migrations apply cleanly with `pnpm db:reset`.
- [ ] Supabase types regenerated with `pnpm run db:types` after schema changes.
- [ ] App version bumped for final code-change session.
- [ ] Manual smoke test completed on `http://localhost:3000`.
- [ ] Settings and roles manually checked.
- [ ] Email sync tested with safe/test mailbox.
- [ ] PDF generation tested.
- [ ] File upload tested.
- [ ] Backup job tested in non-production.
- [ ] Restore tested in non-production.
- [ ] UAT feedback captured.
- [ ] Final handoff notes written.
