# Luxus Sales System — Remaining Work Prompt Pack

Last updated: 2026-05-15

This file is the targeted prompt pack to finish the Luxus Sales System build-out after the high-value prompts in `high_value_prompts.md` have already been executed. Those prompts hardened existing features; the prompts here implement features that were never built or never fully closed, mapping directly to every unchecked checkbox in `.cursor/agent-handoffs/todo.md` (Phases 2, 3, 7, 8, 9, 10, 11, 14, 17, 18, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35).

When all 14 prompts here are executed, the system should be at **95-99% complete**. The remaining 1-5% is live UAT and any deliberately-deferred business decisions.

## How To Use These Prompts

Run one prompt at a time. Each prompt is fully self-contained and ends with a checklist of `todo.md` lines to mark done. Do not run two prompts in parallel — several prompts touch the same tables, settings, and seed files.

Before every prompt, paste this shared preamble:

```md
Read AGENTS.md and the project CLAUDE.md first and follow them exactly. Use `bookings` as the canonical job card entity — do not rename or alias. Use `pnpm` only. Use `createSessionClient()` for user-scoped work and `createServiceClient()` only where RLS bypass is intentional and server-only. Validate all external input with Zod at API boundaries. Return errors with the consistent shape `{ error: string, details?: unknown }`.

When this prompt changes the database:
- Add a new migration in `supabase/migrations/YYYYMMDDHHMMSS_description.sql` using `IF NOT EXISTS` / `DROP IF EXISTS` so it stays idempotent
- Run `pnpm db:reset` locally to confirm it applies cleanly
- Run `pnpm db:types` to regenerate `lib/supabase/types.ts`
- If the change introduces new seed-worthy data (new reference rows, new settings keys, new defaults), update `supabase/seed.sql` so a fresh `pnpm db:reset` produces a working demo dataset
- If the change alters mock fixtures used by dev/test, update `lib/seed-data.ts` to match

When this prompt finishes:
1. Open `.cursor/agent-handoffs/todo.md` and check off the exact lines listed under "Todo lines to mark done" only for what was realy done - not loosely done
2. Bump `APP_VERSION` exactly once with `pnpm app:version:bump`
3. Confirm `pnpm test:ci` passes
4. If routing, build config, or shared types changed, also run `pnpm build`
5. Report: changed files, new migrations, seed updates, tests added, todo lines closed, version bumped from X.XX to Y.YY
```

After each prompt, ask for:

```md
Summarize changed files, new migrations, seed updates (supabase/seed.sql and lib/seed-data.ts), tests added, todo.md lines marked done (paste the exact lines), and any remaining risks or follow-up work.
```

---

## Execution Order

1. Resolve Open Business Decisions (Phase 34)
2. Job Numbering Migration (Phase 8)
3. Outcomes & Cancellation Lifecycle (Phase 11 + Phase 29 header outcome)
4. Enquiry Workflow Completion (Phase 7 + Phase 3 Start Quote audit)
5. Pipeline Gate Completion (Phase 10)
6. Quote Lifecycle Completion (Phase 17 + Phase 18 + Phase 3 quote audit entries)
7. Payment & Invoice Completion (Phase 20 + Phase 3 deposit/booking/invoice audit entries)
8. Voucher Lifecycle Completion (Phase 22 + Phase 23 + Phase 3 voucher audit + Phase 29 repeat-client flag)
9. Attachments, Documents & Job Card Polish (Phase 21 + Phase 3 attachment audit + Phase 29 attachments/notes/owner sections)
10. Customer CRM Completion (Phase 9 repeat client + tests)
11. Follow-Up Worker (Phase 24)
12. Error Logging, Settings Tests & Settings Audit (Phase 25 + Phase 28 error page + Phase 2 + Phase 3 settings audit + Phase 27 unresolved-errors metric)
13. Backup & Restore + Dashboard Reports & Exports (Phase 26 + Phase 28 backup page + Phase 27)
14. Final Hardening: Tests, Security, E2E, UAT, Release Readiness (Phase 14 + Phase 30 + Phase 31 + Phase 32 + Phase 33 + Phase 35)

---

## Prompt 1: Resolve Open Business Decisions (Phase 34)

**Purpose**: Phase 34 has 9 unanswered questions that block defaults, seed data, and downstream prompts. Resolve them before implementation work begins.

```md
Resolve every open business decision in Phase 34 of `.cursor/agent-handoffs/todo.md`.

For each item, inspect the current codebase to find the existing default, then record a decision in a new file `.cursor/agent-handoffs/business_decisions.md` (one section per item: question, current state in code, recommended default, final decision, affected files). Where a decision changes a default that lives in `supabase/seed.sql` (settings rows) or in the Settings UI defaults, update both so a fresh `pnpm db:reset` reflects the chosen value. Where no setting exists yet but should, add a minimal migration adding the setting with the chosen default and seed it.

Decisions to resolve:
1. Quote validity default — 14 days (project overview) vs 30 days (quote document section). Pick one and align settings, seed, and UI defaults.
2. Deposit due rule — X days before departure vs X days after quote acceptance. Pick one + the default number of days.
3. Final payment default — number of days before departure.
4. Outbound email provider — incoming server, outgoing server, Outlook Web availability, Microsoft 365 Exchange Online status, SMTP/app password availability. If unknown, mark as "TBD — provider not yet selected" and surface this in `business_decisions.md`.
5. Voucher visual reference document location — where the design template lives, or note that there is none.
6. Backup storage location for production — Supabase Storage bucket / S3 / other. Pick one (this drives Prompt 13).
7. Read-only export permissions — whether read-only users may export reports (drives Prompt 13 export gate).
8. Payment reference number — mandatory or optional (drives Prompt 7 validation).
9. Quote acceptance after validity date — allowed or blocked (drives Prompt 6 expiry behavior).

Acceptance criteria:
- `.cursor/agent-handoffs/business_decisions.md` exists and covers all 9 items.
- Where the decision changes a setting default, `supabase/seed.sql` and the Settings UI default match.
- No code feature is built in this prompt — only the decision record and any seed/default alignment.

Todo lines to mark done (Phase 34):
- [ ] Confirm quote validity default
  - [ ] 14 days from project overview, or
  - [ ] 30 days from quote document section
- [ ] Confirm deposit due rule (both sub-bullets)
- [ ] Confirm recommended default for deposit due date
- [ ] Confirm final payment default days before departure
- [ ] Confirm outbound email provider (all sub-bullets)
- [ ] Confirm voucher visual reference document location
- [ ] Confirm backup storage location for production
- [ ] Confirm whether read-only users may export reports
- [ ] Confirm whether payment reference number is mandatory
- [ ] Confirm whether quote acceptance after validity date is allowed

This prompt makes no code changes beyond `business_decisions.md` and possibly a small settings-default migration + `supabase/seed.sql` update + Settings UI defaults. Bump `APP_VERSION` only if those small changes were made.
```

---

## Prompt 2: Job Numbering Migration (Phase 8)

**Purpose**: Migrate booking numbers from global `LUX-YYYY-######` to product-prefixed `BT-YYYY-0001` / `RR-YYYY-0001` with per-product-per-year sequences.

```md
Implement product-prefixed, per-year booking numbering as specified in Phase 8 of `.cursor/agent-handoffs/todo.md`.

Database:
- Migration: create `booking_number_sequences (product_code text, year int, last_number int, primary key (product_code, year))` with `IF NOT EXISTS`.
- Migration: create or replace a Postgres function `next_booking_number(p_product_code text, p_year int) returns int` that does an atomic upsert returning the next number — use `INSERT ... ON CONFLICT ... DO UPDATE SET last_number = booking_number_sequences.last_number + 1 RETURNING last_number`. This is concurrency-safe under Postgres.
- Do not rewrite history. Leave existing `LUX-YYYY-######` bookings as-is.

API / generation:
- Determine product code from `bookings.train_product` (or equivalent field): "Blue Train" -> `BT`, "Rovos Rail" -> `RR`. Unknown product must either route the enquiry to Needs Review with no number issued, or fall back to a clearly-marked review code — implement whichever matches existing review-fallback behavior in the repo.
- Generate the final formatted string `${code}-${year}-${zeroPad(number, 4)}` and store on `bookings.booking_number` at the moment of ingestion/creation.
- Update every UI surface and PDF template that displays the booking number to handle both legacy `LUX-...` and new `BT-...`/`RR-...` formats without crashing.

Seed:
- Update `lib/seed-data.ts` mock bookings to use the new `BT-YYYY-0001` / `RR-YYYY-0001` format.
- Update `supabase/seed.sql` if it inserts demo bookings (it currently seeds users only — confirm and skip if so).

Tests:
- Blue Train counter increments independently from Rovos counter
- Rovos counter increments independently from Blue Train counter
- Counter resets when the year changes
- Two concurrent inserts produce distinct numbers (write a Vitest test that fires two `next_booking_number` calls and asserts no duplicates — can use a Postgres testing helper or mock at the function boundary; if mocking, simulate the atomic upsert behavior)
- Unknown supplier/product falls back safely (review fallback or rejection — match what exists)
- Generated string format matches `^(BT|RR)-\d{4}-\d{4}$`

Todo lines to mark done (Phase 8):
- [ ] Migrate from global `LUX-YYYY-######` if still present.
- [ ] Generate product prefix from parsed train product (both sub-bullets)
- [ ] Generate format `BT-YYYY-0001`.
- [ ] Generate format `RR-YYYY-0001`.
- [ ] Reset sequences per product per year.
- [ ] Ensure counters are concurrency-safe.
- [ ] Ensure job number is created immediately at ingestion/job creation.
- [ ] Add tests (all 5 sub-bullets)
```

---

## Prompt 3: Outcomes & Cancellation Lifecycle (Phase 11 + Phase 29)

**Purpose**: Add structured outcome lifecycle (Open / Won / Lost / Cancelled) with required reason on Lost/Cancelled, including the outcome on the job card header.

```md
Implement booking outcome lifecycle per Phase 11 of `.cursor/agent-handoffs/todo.md`, and surface it on the job card header per Phase 29.

Database:
- Migration: add `bookings.outcome text not null default 'Open'` with a check constraint enforcing one of `('Open','Won','Lost','Cancelled')`.
- Migration: create `outcome_reasons (id uuid primary key, label text not null, applies_to text not null check (applies_to in ('Lost','Cancelled','Both')), active bool not null default true, created_at timestamptz)`.
- Migration: add `bookings.outcome_reason_id uuid references outcome_reasons(id)`, `bookings.outcome_notes text`, `bookings.outcome_set_at timestamptz`, `bookings.outcome_set_by uuid references profiles(id)`.

Auto-transition:
- When `bookings.pipeline_stage` transitions to `Voucher Sent` and outcome is currently `Open`, set outcome to `Won` automatically (no reason required), emit audit log.

API:
- New `PATCH /api/bookings/:id/outcome` accepting `{ outcome, reason_id?, outcome_notes? }`. Validate with Zod.
- Validation: `Lost` and `Cancelled` MUST include `reason_id`. If the chosen reason has label `Other`, `outcome_notes` is required and non-empty.
- Auth: any authenticated consultant+ for the booking they own; manager+ for any. Read-only forbidden.
- Emit audit log entry on every outcome change including before/after state.

Settings UI:
- New page `/app/settings/outcome-reasons` (Manager/Admin only) for listing, creating, deactivating outcome reasons.
- Reuse the standard Settings layout pattern.

Job card UI (Phase 29):
- Header chip showing outcome (Open/Won/Lost/Cancelled). Color-coded but never relying on color alone — include a label.
- When user picks Lost or Cancelled, show reason dropdown + conditional `Other` text field. Existing cancellation dialog already validates — wire to the new `outcome_reasons` table instead of any hard-coded list it may use.
- Header also needs `owner` display (Phase 29 sub-bullet) — surface `bookings.owner_user_id` resolved to profile name.

Seed:
- `supabase/seed.sql`: insert default outcome reasons:
  - Lost: "Price too high", "Date conflict", "Chose competitor", "No response", "Other"
  - Cancelled: "Customer cancelled", "Trip cancelled by supplier", "Payment failed", "Schedule changed", "Other"
- `lib/seed-data.ts`: ensure any mock bookings include an `outcome` field defaulting to `Open`.

Tests:
- `Lost` requires reason → 400 without reason
- `Cancelled` requires reason → 400 without reason
- `Other` reason requires non-empty outcome_notes → 400 if empty
- Default outcome on new booking is `Open`
- Voucher Sent auto-sets `Won` and emits audit
- Cancellation pre-existing refund flow still works end-to-end and audit is created
- Role check: read-only forbidden, consultant can set outcome on their own booking, manager can set on any

Todo lines to mark done:
- Phase 11: all unchecked outcome/reason bullets (Add/confirm outcome field + 4 sub-bullets; Default outcome to Open; Add outcome reason table/settings; Require outcome reason for Lost; Require outcome reason for Cancelled; Require free text when reason is `Other`; Allow Admin/Manager to manage reason dropdown options; all 6 test sub-bullets)
- Phase 29: header `owner`, header `outcome` (do NOT mark `repeat client flag` — that ships in Prompt 8)
```

---

## Prompt 4: Enquiry Workflow Completion (Phase 7 + Phase 3 Start Quote audit)

**Purpose**: Finish the New Enquiries screen with filters, parsed-field editing, Start Quote audit, and component-state tests.

```md
Complete the New Enquiries workflow per Phase 7 of `.cursor/agent-handoffs/todo.md`.

Filters on `/app/enquiries`:
- Add filter chips: `Needs Review`, `Complete`, `Unassigned`, `My Enquiries`, `Possible Duplicates`.
- Filter state lives in URL query params (e.g. `?filter=needs_review`) so links are shareable and survive reload.
- Server-side filtering via the existing enquiries GET endpoint — add query-param parsing and SQL filters; do not filter on the client only.
- `My Enquiries` resolves from the authenticated user's id; `Unassigned` checks `owner_user_id IS NULL`; `Possible Duplicates` checks the existing duplicate-suspected reference field on imported bookings.

Editing imported parsed fields:
- On the enquiry detail screen, allow inline editing of imported parsed fields (passenger count, dates, train product, suite selection, etc.).
- Persist edits via existing booking update API. Each changed field must emit an audit log entry capturing field name + before/after value (use existing `audit_logs` schema with the field-change pattern already in use elsewhere).

Start Quote audit:
- The Start Quote action already exists and is gated. Add an audit log entry the moment Start Quote succeeds (entity_type=booking, action=`start_quote`, actor=current user). Wire this in the API handler, not the UI.

Component tests:
- Use Vitest + Testing Library. For the enquiries list and enquiry detail components, cover loading, empty, error, and success states with mocked SWR/data hooks.

Seed: no changes expected.

Todo lines to mark done:
- Phase 7:
  - [ ] Add filters (all 5 sub-bullets)
  - [ ] Allow editing imported parsed fields.
  - [ ] Audit Start Quote.
  - [ ] Add component tests for loading, empty, error, and success states.
- Phase 3:
  - The Start Quote audit closes part of Phase 3 indirectly — do NOT mark Phase 3 lines here; those remain under their feature prompts.
```

---

## Prompt 5: Pipeline Gate Completion (Phase 10)

**Purpose**: Close remaining pipeline-gate gaps — voucher gates, pipeline API test coverage, and Kanban UI tests/keyboard checklist.

```md
Complete pipeline gate enforcement and test coverage per Phase 10 of `.cursor/agent-handoffs/todo.md`.

Server-side gates (verify, add if missing):
- Block transition to `Voucher Sent` unless `bookings.invoice_balance = 0`.
- Block transition to `Voucher Sent` unless required booking fields AND required customer fields are complete. Define "required" as the same set already enforced by voucher generation (Phase 23 already has these gates for generation — reuse the same validator function so generation and stage transition share one source of truth).
- If the validator function does not exist yet, create one in `lib/voucher-readiness.ts` (or similar) and have both the pipeline transition handler and the voucher generation handler call it.

Pipeline API tests:
- `unauthenticated` → 401
- `read-only forbidden for mutation` → 403
- `valid move` → 200, state updated, audit created
- `invalid move` (e.g. skipping a required stage) → 400
- `review gate` (cannot move forward when imported booking is in Needs Review with unresolved fields) → 400
- `voucher gate` (cannot move to Voucher Sent when balance != 0 OR required fields missing) → 400

Kanban UI accessibility:
- Add a Vitest + Testing Library test confirming Kanban cards are keyboard-reachable (Tab navigation order) and that the stage column is announced via aria-label.
- If keyboard drag-drop is not implemented (drag-drop libraries often don't support it natively), add a documented keyboard-equivalent action (e.g. context menu or stage-change dropdown on each card) and a comment at the top of the Kanban component explaining the keyboard interaction model.

Seed: no changes expected.

Todo lines to mark done (Phase 10):
- [ ] Block Voucher Sent unless `invoice_balance = 0`.
- [ ] Block Voucher Sent unless required booking/customer fields are complete.
- [ ] Add pipeline API tests (the 5 unchecked sub-bullets — `payment gate` already done)
- [ ] Add Kanban UI tests or manual checklist for drag/drop and keyboard access.
```

---

## Prompt 6: Quote Lifecycle Completion (Phase 17 + Phase 18 + Phase 3 quote audit)

**Purpose**: Close every remaining quote-lifecycle gap: missing table columns, title/status labels, validity-from-settings, PDF storage, email attach, quote-edit audit, and PDF/email failure tests.

```md
Complete the quote lifecycle per Phases 17 and 18 of `.cursor/agent-handoffs/todo.md`.

Database:
- Migration: add to `quotes` (using `IF NOT EXISTS`/`ADD COLUMN IF NOT EXISTS` patterns) any missing columns from:
  - `title text` (default `'PROVISIONAL QUOTATION'`)
  - `amount_received numeric default 0`
  - `outstanding_amount numeric` (computed via trigger or calculated in API; pick the simpler approach already used elsewhere in the repo)
  - `pdf_document_id uuid references documents(id)`
- Migration: add to `quote_items`:
  - `status text default 'active'` (or whatever enum is already in use — inspect first)
- If any of these already exist, skip and note in the summary.

Title and status labels:
- The quote PDF template and quote UI must render the title `PROVISIONAL QUOTATION` and the status label `STATUS: Provisional` (or use the existing quote status text mapped to `Provisional` while a quote is in `draft`/`ready`/`sent`).
- Update PDF generation and the quote detail page accordingly.

Validity from settings:
- Quote validity must come from a settings value, not a hard-coded number. Use the value resolved by Prompt 1 (`business_decisions.md`).
- Ensure the setting exists and is loaded server-side when generating a new quote. Update existing code that hard-codes 14 or 30 to read from settings.

PDF storage and email attach:
- On quote send, generate the PDF (existing code), upload it to Supabase Storage in a `quotes/` private bucket, create a `documents` row with kind `quote_pdf` and link it to `quotes.pdf_document_id`.
- Attach the stored PDF (via signed URL or buffer fetch from storage) to the quote email when sending.
- Use the existing email provider pattern — no new provider unless Prompt 1 dictates one.
- Populate `recipients` in the existing correspondence record.

Quote edit audit:
- On every quote update API call that mutates substantive fields (line items, totals, deposit %, validity), emit an audit log entry with before/after JSON.
- Also emit audit entries for `quote_generated` (when a quote first reaches `ready` status) and `quote_sent` (when status moves to `sent`). These close two Phase 3 audit gaps.

Tests (mock PDF, storage, and email):
- PDF generation success creates `documents` row and links it to the quote
- PDF generation failure logs an error (use the existing error-logging mechanism if present, otherwise console.error placeholder for now — Prompt 12 wires the real logger)
- Email send success records correspondence with status `sent` and includes recipients
- Email send failure records correspondence with status `failed` and the error
- Quote edit after send creates a new audit entry capturing before/after
- Validity reads from settings (changing the setting changes new quote validity dates)

Seed:
- Ensure `supabase/seed.sql` has the quote validity setting row with the value chosen in Prompt 1.

Todo lines to mark done:
- Phase 17:
  - [ ] Confirm quote table supports: title, amount received, outstanding amount, PDF file id
  - [ ] Confirm quote line item table supports: status
  - [ ] Quote title must be `PROVISIONAL QUOTATION`.
  - [ ] Quote status label must be `STATUS: Provisional`.
  - [ ] Quote validity must come from settings.
  - [ ] Default quote validity should be confirmed against spec/current app (all 3 sub-bullets — closed by Prompt 1; mark them here as well to confirm wiring)
  - [ ] Audit quote edits.
  - [ ] Add tests: (parent bullet — all Phase 17 test sub-bullets are already checked; mark this parent done)
- Phase 18:
  - [ ] Store generated quote PDF in storage/documents.
  - [ ] Create document record for quote PDF.
  - [ ] Attach quote PDF to quote email.
  - [ ] Send via existing email provider pattern.
  - [ ] Store correspondence record: `recipients`
  - [ ] Add tests with mocked PDF/email/storage (the 4 unchecked sub-bullets: PDF success, PDF failure, email success, email failure)
- Phase 3 audit gaps:
  - [ ] quote generated
  - [ ] quote sent
```

---

## Prompt 7: Payment & Invoice Completion (Phase 20 + Phase 3 deposit/booking/invoice audit)

**Purpose**: Close every remaining payment gap — schema fields, required validation, overdue flag, reminder worker, refund/negative-payment behavior, and the related audit entries.

```md
Complete payment handling per Phase 20 of `.cursor/agent-handoffs/todo.md`, plus the related Phase 3 audit gaps.

Database:
- Migration: add to `payments` if missing — `invoice_id uuid references invoices(id)`, `captured_by uuid references profiles(id) not null` (backfill existing rows by joining through booking to a default admin or to the creator if recoverable; if not, use a system user UUID and document this in the migration).
- Migration: add to `invoices` if missing — `overdue bool generated always as (status != 'paid' and due_date < current_date) stored` (or compute in API if generated columns are restricted).
- Migration: payment reminder settings table or settings rows:
  - `payment_reminder_cadence` (e.g. `[3,7,14]` days after due)
  - `payment_reminder_enabled` boolean
- Migration: `payment_reminders (id, invoice_id, scheduled_for, sent_at, status, error)` to track sent reminders.

API and validation:
- Payment capture requires `payment_date` (Zod).
- Payment reference required if Prompt 1's decision was `mandatory`; otherwise optional.
- Booking confirmation API must check `bookings.deposit_paid = true` before allowing the transition out of Quote Accepted/Deposit Invoice Sent.
- Refund/negative-payment behavior: allow negative `amount` only when a `payment_kind` field (add migration column with default `'capture'`) is `'refund'`. Recalculate invoice balance accordingly.

Overdue and reminder worker:
- Add a cron route `/api/cron/payment-reminders` (Vercel cron or scheduled job) that:
  - Finds unpaid invoices past due date
  - For each, checks `payment_reminders` for what's already been sent
  - Sends the next reminder per the settings cadence
  - Logs success/failure to `payment_reminders` and the audit log
  - Skips invoices that have since been paid in full

Audit entries (close Phase 3 gaps):
- `deposit_invoice_sent` — emit when deposit invoice transitions to `sent`
- `deposit_marked_paid` — emit when `deposit_paid` flips to true
- `booking_made` / `booking_confirmed` — emit when pipeline transitions to Booking Made (or whatever the canonical confirmed stage is in the codebase — match existing pipeline naming)
- `invoice_marked_paid` — emit when an invoice transitions to `paid`

Seed:
- `supabase/seed.sql`: add the payment_reminder settings rows with chosen defaults (e.g. enabled=true, cadence `[3,7,14]`).

Tests:
- Overdue flag computes correctly (mock current_date)
- Reminder worker sends due reminders and skips paid invoices
- Reminder worker logs failure to `payment_reminders.status = 'failed'`
- Refund/negative payment recalculates balance correctly and emits audit
- Booking confirmation blocked when `deposit_paid = false` → 400
- Payment date required → 400 without it
- Reference required when settings say mandatory → 400 without it
- All 4 new audit entries fire under their respective triggers

Todo lines to mark done:
- Phase 20:
  - [ ] Confirm payment table supports: invoice id, captured by user id
  - [ ] Require payment date.
  - [ ] Require reference number if business requires it.
  - [ ] Prevent booking confirmation without deposit paid.
  - [ ] Add overdue payment flag.
  - [ ] Add payment reminder settings.
  - [ ] Add payment reminder worker.
  - [ ] Add tests: refund/negative payment behavior explicit, reminder due, reminder skipped after paid
- Phase 3 audit gaps:
  - [ ] deposit invoice sent
  - [ ] deposit marked paid
  - [ ] booking made / confirmed
  - [ ] invoice marked paid
```

---

## Prompt 8: Voucher Lifecycle Completion (Phase 22 + Phase 23 + Phase 3 voucher audit + Phase 29 repeat client)

**Purpose**: Build modular voucher service blocks, gate voucher sending, send voucher email, audit voucher sent, and surface the repeat-client flag on the job card.

```md
Complete voucher lifecycle per Phases 22 and 23 of `.cursor/agent-handoffs/todo.md`, plus the Phase 3 audit gap and the Phase 29 repeat-client flag.

Database:
- Migration: confirm/add to `vouchers`:
  - `voucher_number text not null`, `pdf_document_id uuid references documents(id)`, `generated_at timestamptz`, `sent_at timestamptz`, `created_by uuid references profiles(id) not null`
- Migration: create `voucher_service_blocks (id, voucher_id, service_type, supplier_id, title, supplier_reference, contact_details jsonb, service_data jsonb, display_order int)` with check constraint on `service_type in ('train','hotel','transfer','tour','airline','additional_service')`.

Modular service blocks:
- On voucher generation, build one service block per booked component (train, hotel, transfer, tour, airline, additional service). Each block includes:
  - Resolved supplier reference (FK to suppliers)
  - Snapshot of supplier contact details (name, phone, email, address) so future supplier edits don't change historical vouchers
  - Service-type-specific data in `service_data` JSON (e.g. train: route, suite, dates; hotel: room type, nights, meal plan)
- Render blocks in `display_order` in the PDF — keep the layout modular so adding a new service type later is a JSX block, not a full template rewrite.
- If a voucher visual reference document exists (from Prompt 1), follow it for spacing/typography; otherwise use the existing voucher PDF style.

Send and gates:
- New API `POST /api/vouchers/:id/send` that:
  - Blocks if `bookings.invoice_balance != 0` → 400
  - Blocks if required booking/customer fields incomplete → 400 (reuse the `lib/voucher-readiness.ts` validator from Prompt 5)
  - Sends voucher email with the generated PDF attached
  - On success: writes correspondence record, sets `vouchers.sent_at`, transitions booking to Voucher Sent (already auto-updates customer first/last travel dates per existing code), emits audit log entry `voucher_sent`

Audit:
- `voucher_sent` audit entry on successful send (closes Phase 3 gap).

Job card header repeat-client flag (Phase 29):
- Resolve repeat client by checking if the booking's customer has any prior booking that reached Voucher Sent (Phase 9 already defines this). Display a `Repeat Client` chip in the job card header when true.

Tests:
- Service blocks render in correct `display_order`
- PDF generation failure logs error and does not leave a half-created voucher row
- Send blocked when balance != 0
- Send blocked when required fields missing
- Send success records correspondence, emits audit, sets sent_at
- Send failure records correspondence with status=failed and audit logs error
- Repeat client chip appears for customer with prior Voucher Sent booking

Seed:
- `lib/seed-data.ts`: ensure mock voucher data fits the new schema.

Todo lines to mark done:
- Phase 22:
  - [ ] Confirm voucher table supports (all 6 sub-bullets)
  - [ ] Confirm voucher service block table supports (all 8 sub-bullets)
  - [ ] Build modular voucher service blocks for (all 6 service types)
  - [ ] Include supplier references in blocks.
  - [ ] Include supplier contact details in blocks.
  - [ ] Use uploaded voucher document as design inspiration if available.
  - [ ] Keep voucher implementation modular rather than hard-coded one-off layout.
  - [ ] Add tests: service block order, PDF generation failure logs error
- Phase 23:
  - [ ] Block voucher sending if invoice balance is not zero.
  - [ ] Block voucher sending if required fields are incomplete.
  - [ ] Send voucher email with PDF attachment.
  - [ ] Store voucher correspondence record.
  - [ ] Audit voucher sent.
  - [ ] Add tests: send success, send failure logs error
- Phase 3 audit gap:
  - [ ] voucher sent
- Phase 29:
  - [ ] repeat client flag (header)
```

---

## Prompt 9: Attachments, Documents & Job Card Polish (Phase 21 + Phase 3 attachment audit + Phase 29 attachments/notes sections)

**Purpose**: Build the general safe upload API, add document-list UI states, attachment audit, and finalize the job/booking card's Attachments and Internal Notes sections.

```md
Complete attachments and document handling per Phase 21 of `.cursor/agent-handoffs/todo.md`, plus the related Phase 3 audit gap and Phase 29 sections.

Database:
- Migration: confirm/add to `documents` (or whatever the canonical attachments table is — inspect before changing):
  - `file_name text not null`, `file_kind text not null`, `uploaded_by uuid references profiles(id) not null`
  - If a separate `attachments` table exists alongside `documents`, audit which is used where and document the decision.
- Migration: `booking_notes (id, booking_id, author_id, body text, created_at)` for the Internal Notes section if it does not already exist.
- Migration: confirm `bookings` has a `supplier_reference text` column (or equivalent) for recording the supplier's own confirmation/booking reference number. Add the column if missing.

General safe upload API:
- New `POST /api/documents/upload` accepting multipart form data with `file`, `booking_id`, `kind` (e.g. `quote_pdf`, `invoice_pdf`, `voucher_pdf`, `summary_pdf`, `proof_of_payment`, `other`).
- Auth: any authenticated user. Read-only forbidden.
- Validation:
  - File size limit configurable via settings (default 10 MB)
  - MIME allowlist (PDF, JPG, PNG, DOCX, XLSX) — configurable
- Store in Supabase Storage in a private bucket; do not return raw storage paths. For reads use signed URLs.
- Create `documents` row with all fields populated, including `uploaded_by`.
- Emit audit log entry `attachment_uploaded` with entity_type=booking, entity_id=booking_id, metadata={ document_id, kind, file_name } (closes Phase 3 gap).
- Emit audit log entry `supplier_reference_captured` when `bookings.supplier_reference` is set or updated, capturing before/after value (closes Phase 3 gap).

UI states (document list):
- Existing document list components must render explicit loading and error states (empty and success already exist). Add skeletons for loading and a retry affordance for error.

Job card sections (Phase 29):
- Attachments section: list documents for the booking, with kind badge, file name, upload date, uploader, download (signed URL), delete (with permission gate matching existing policy). Show loading/empty/error/success states.
- Internal Notes section: list `booking_notes`, allow create/edit/delete by author (and edit/delete by manager+), include author name and timestamp.

Tests:
- Oversized file rejected → 400
- Wrong MIME rejected → 400
- Unauthenticated upload → 401
- Read-only forbidden → 403
- Successful upload writes storage object, creates `documents` row with `uploaded_by`, emits audit
- Signed URL is returned, not raw path
- Internal note create/edit/delete permission rules enforced

Seed:
- `supabase/seed.sql`: optional seed of 1-2 demo notes on a demo booking to make the section visibly populated; only if other demo bookings exist in the seed.

Todo lines to mark done:
- Phase 21:
  - [ ] Confirm attachment table supports: file name, file type/kind, uploaded by user id
  - [ ] Implement general safe upload API.
  - [ ] Restrict general upload to authenticated users.
  - [ ] Enforce general file size/type rules.
  - [ ] Store general files in Supabase Storage or current chosen storage.
  - [ ] Do not expose private storage paths without signed URLs if private.
  - [ ] Add tests for general upload validation.
  - [ ] Add mocked storage tests for general uploads.
  - [ ] Add UI states for document list: loading, error
- Phase 3 audit gaps:
  - [ ] attachment uploaded
  - [ ] supplier reference captured
- Phase 29:
  - [ ] Attachments section.
  - [ ] Internal notes section.
```

---

## Prompt 10: Customer CRM Completion (Phase 9)

**Purpose**: Close the remaining Customer CRM gaps — repeat-client marking, customer-matching tests, and component-state tests.

```md
Complete Customer CRM behavior per Phase 9 of `.cursor/agent-handoffs/todo.md`.

Repeat client marking:
- Add a derived/computed field for repeat client status: a customer is a repeat client when they have at least one prior booking that reached Voucher Sent. This is already partially defined.
- Expose this status via the customer API and on customer profile UI. Prompt 8 already added the header chip on the job card — this prompt extends to the customer profile view if not already present.
- If `bookings` need a denormalized `is_repeat_client_at_creation` for historical accuracy, add a migration and backfill — otherwise compute on read.

Tests (Phase 9 unchecked tests):
- Existing email links to existing customer on import (use parser fixture + mock supabase)
- New email creates a new customer
- Same name but different email creates a new customer (no merge)
- Repeat client flag is set correctly for a customer with a prior Voucher Sent booking, and unset otherwise

Component tests:
- Customer list and customer detail components: loading, empty, error, success states with mocked SWR data hooks.

Seed: no changes expected unless mock customers in `lib/seed-data.ts` need a repeat-client example — add one if useful for manual testing.

Todo lines to mark done (Phase 9):
- [ ] Mark new booking as Repeat Client if customer has completed trip.
- [ ] Add tests (unchecked sub-bullets: existing email links customer, new email creates customer, same name different email creates new customer, repeat client flag set)
- [ ] Add component coverage for customer loading, empty, error, success states.
```

---

## Prompt 11: Follow-Up Worker (Phase 24)

**Purpose**: Automated quote follow-up emails with settings, schedule, skip rules, and audit.

```md
Implement the quote follow-up worker per Phase 24 of `.cursor/agent-handoffs/todo.md`.

Database:
- Migration: `quote_follow_ups (id, quote_id, scheduled_for timestamptz, sent_at timestamptz, status text, skip_reason text, error text)` tracking each scheduled follow-up.
- Migration: follow-up settings rows in the settings table:
  - `quote_follow_up_enabled` bool default true
  - `quote_follow_up_cadence_days` (e.g. `[3,7]` days after quote sent, plus a `1` day before expiry follow-up)
  - `quote_follow_up_template` text (basic markdown body)

Worker:
- New cron route `/api/cron/quote-follow-ups` (Vercel cron or scheduled).
- Logic per run:
  - Find quotes in status `sent` not yet `accepted`/`expired`/`cancelled`/`superseded`
  - For each, compute the next due follow-up based on cadence and any rows already in `quote_follow_ups`
  - Skip if quote progressed (status changed) or follow-ups disabled at quote level
  - Send email via existing email provider, record `quote_follow_ups.sent_at` + `status='sent'`, plus a correspondence record
  - On failure: `status='failed'`, error stored, info-level error log (Prompt 12 wires the real logger)

Quote-level disable:
- Add `quotes.follow_ups_disabled bool default false` so a consultant can opt-out per quote.

Settings UI:
- Add a section to Settings → Quote and Sales for the cadence and template (Manager/Admin only).

Seed:
- `supabase/seed.sql`: insert the three new settings rows with the chosen defaults.

Tests:
- Due detection: quote sent 3+ days ago triggers
- Skip on accepted: quote with status `accepted` is not sent any follow-up
- Skip on expired/superseded/cancelled
- Skip when `follow_ups_disabled = true` on the quote
- Skip when global setting `quote_follow_up_enabled = false`
- Email failure logs the error and writes `quote_follow_ups.status='failed'`
- Correspondence record created on success

Todo lines to mark done (Phase 24):
- [ ] Add quote follow-up settings (all 3 sub-bullets)
- [ ] Find quote follow-ups due.
- [ ] Send follow-up email if enabled.
- [ ] Stop follow-ups if job progressed.
- [ ] Stop follow-ups if disabled for job.
- [ ] Log skipped follow-ups as info where useful.
- [ ] Add tests (all 4 sub-bullets)
```

---

## Prompt 12: Error Logging, Settings Tests & Settings Audit (Phase 25 + Phase 28 error page + Phase 2 + Phase 3 settings audit + Phase 27 unresolved errors metric)

**Purpose**: Build the full error logging system (table, helper, API, UI, badge), close the Phase 2 settings API tests, audit settings changes, and add the unresolved-errors dashboard metric.

```md
Implement error logging end-to-end per Phase 25 of `.cursor/agent-handoffs/todo.md`, plus Phase 28 page, Phase 2 settings tests, Phase 3 settings audit, and the Phase 27 unresolved-errors metric.

Database:
- Migration: confirm/add `error_logs (id, severity text check (severity in ('Critical','Warning','Info')), source text, message text, details jsonb, resolved bool default false, resolved_by uuid references profiles(id), resolved_at timestamptz, created_at timestamptz)` with `IF NOT EXISTS`.

Logger helper:
- New `lib/error-log.ts` exporting `logError({ severity, source, message, details })`. Use `createServiceClient()` to bypass RLS for inserts (errors must be loggable even from public/anonymous contexts).
- Replace ad-hoc `console.error` calls in critical paths with this helper:
  - mailbox cannot connect (Critical)
  - email sync failed (Critical)
  - quote PDF generation failed (Critical)
  - invoice generation failed (Critical)
  - voucher generation failed (Critical)
  - backup failed (Critical, Prompt 13)
  - restore failed (Critical, Prompt 13)
  - required field missing on import (Warning)
  - date could not be parsed (Warning)
  - rate not found (Warning)
  - duplicate email detected (Warning)
  - email moved to processed folder failed (Warning)
  - email sent but timeline update failed (Warning)
  - duplicate ignored (Info)
  - follow-up skipped because job progressed (Info)
  - reminder skipped because payment already marked paid (Info)

APIs:
- `GET /api/error-logs?severity=&resolved=` (Manager/Admin only). Paginated.
- `POST /api/error-logs/:id/resolve` (Manager/Admin only). Sets `resolved=true`, `resolved_by`, `resolved_at`. No resolution note required per spec.

UI:
- New page `/app/settings/error-log` with severity and resolved filters, list, detail drawer, resolve button.
- Header/Settings navigation badge showing count of unresolved errors (visible to Manager/Admin only). Implement via a small SWR hook polling the new GET endpoint with `resolved=false&count=true` (or use the existing badge pattern in the codebase if one exists).
- Dashboard summary metric: add `Unresolved errors` to the existing dashboard summary metrics (Phase 27 unchecked bullet).

Settings audit (Phase 3 gap):
- Wrap the settings update API so every change emits an audit log entry with before/after JSON for the changed setting keys.

Settings API tests (Phase 2):
- Unauthenticated → 401
- Insufficient role → 403
- Invalid body → 400
- Valid update → 200 and persists
- Update is audited (assert audit log row created)

Tests for error logging:
- `logError` writes a row with correct severity
- List endpoint filters by severity and resolved
- Badge count returns unresolved count
- Resolve flow sets resolved_by + resolved_at, returns 200
- Unauthenticated resolve → 401
- Consultant/Read-only resolve → 403 (read-only behavior matches decision recorded in Phase 25 if any — default to forbidden)

Seed:
- `supabase/seed.sql`: no error log rows needed (errors should be empty on fresh reset).

Todo lines to mark done:
- Phase 25:
  - [ ] Confirm error log table supports (all 8 unchecked sub-bullets)
  - [ ] Support severities (all 3 sub-bullets)
  - [ ] Log critical errors (all 7 sub-bullets)
  - [ ] Log warning errors (all 6 sub-bullets)
  - [ ] Log info events (all 3 sub-bullets)
  - [ ] Add Settings error-log page.
  - [ ] Add unresolved error badge on Settings nav.
  - [ ] Allow users to mark errors resolved.
  - [ ] No resolution note required for MVP.
  - [ ] Add tests (all 6 sub-bullets)
- Phase 28:
  - [ ] Error log page complete.
- Phase 2:
  - [ ] Add API tests for settings (all 5 sub-bullets)
  - [ ] Add visible unresolved-error badge on Settings when error logging is complete.
- Phase 3:
  - [ ] settings changes (audited)
- Phase 27:
  - [ ] unresolved errors (dashboard summary metric)
```

---

## Prompt 13: Backup & Restore + Dashboard Filters, Reports & Exports (Phase 26 + Phase 28 backup page + Phase 27)

**Purpose**: Implement backup & restore (entire Phase 26), the backup/restore page, and the dashboard filters/reports/exports (Phase 27 remaining items).

```md
Implement backup & restore and dashboard reporting per Phases 26 and 27 of `.cursor/agent-handoffs/todo.md`.

### Part A: Backup & Restore (Phase 26 + Phase 28 page)

Storage location: use the choice recorded in Prompt 1 (`business_decisions.md`). Default to a private Supabase Storage bucket `backups/` if no decision was made.

Database:
- Migration: `backups (id, created_at, size_bytes, location text, created_by uuid references profiles(id) nullable, status text check (status in ('pending','completed','failed')), error text)`.

Worker (cron):
- `/api/cron/backup` runs every 24 hours.
- Exports core tables to a single JSON snapshot (one object per table, with row data). Tables: customers, bookings, quotes, quote_items, invoices, payments, suppliers, supplier rates, packages, package legs, vouchers, voucher_service_blocks, documents, correspondence, audit_logs, settings, profiles, outcome_reasons, error_logs, backups (excluding self).
- Uploads to the configured storage location with a timestamped key.
- Inserts a `backups` row with `status='completed'`. On failure, `status='failed'`, log Critical error via the Prompt 12 logger.
- Retention: delete `backups` storage objects and rows older than 14 days.

Restore API:
- `POST /api/backups/:id/restore` — Admin/Manager only.
- Requires a confirmation token in the body (e.g. user must type the backup id or "RESTORE") to prevent accidental clicks. Manager+ role check.
- Runs the restore in a transaction: truncate each table, insert rows from snapshot, restore sequences.
- Emit audit log entry `backup_restored`.
- On failure, log Critical error, return 500 with a sanitized message.

Settings → Backup & Restore page (`/app/settings/backups`):
- Lists `backups` (date, size, status, created_by).
- Manual `Create backup now` button (Admin/Manager).
- Download backup (signed URL).
- Restore button per row → shows warning dialog (entire database will roll back, changes after this backup will be lost) and requires the confirmation token.
- No selective restore.

Tests:
- Backup worker writes file, creates `backups` row
- Retention deletes backups older than 14 days
- Restore requires the confirmation token → 400 without
- Restore permission enforced → 403 for Consultant
- Backup failure logs Critical error
- Restore success emits `backup_restored` audit

Seed: no changes expected.

### Part B: Dashboard Filters, Reports & Exports (Phase 27)

Filters on the dashboard:
- consultant, product (BT/RR), date range, status/stage. Persist in URL query params. Filters apply to the summary metrics AND the active pipeline view.

Reports (`/app/reports/...`):
- Sales per salesperson (by month or date range)
- Conversion rate (enquiry → quote → accepted → paid)
- Revenue per product (BT vs RR)
- Outstanding payments (current outstanding by booking, with customer + due date)
- New enquiries by source/mailbox

Each report is a page or section with the same filter set. API endpoints under `/api/reports/*`. Auth: all roles can view; export gate per Prompt 1's decision (read-only export allowed or denied).

Exports:
- CSV export for every report.
- PDF export only for reports where the existing PDF tooling renders tabular data cleanly (revenue, outstanding payments). Otherwise skip and note.

UI states:
- Every report page must render loading, empty, error, success states.

Tests:
- Each report query returns expected rows against a seeded dataset
- Export authorization: read-only allowed/denied per Prompt 1's decision
- Filter combinations narrow results correctly (consultant + product + date range)

Seed:
- If `supabase/seed.sql` does not seed bookings/quotes/invoices in any quantity, leave reports verifiable via `lib/seed-data.ts` fixtures used in tests. Do not add large mock datasets to seed.sql.

Todo lines to mark done:
- Phase 26: all unchecked bullets (the entire phase)
- Phase 28:
  - [ ] Backup/restore page complete.
- Phase 27:
  - [ ] Add filters (all 4 sub-bullets)
  - [ ] Add reports (all 5 sub-bullets)
  - [ ] Add CSV export.
  - [ ] Add PDF export only if existing PDF tooling supports it cleanly.
  - [ ] Ensure export permission rules are explicit.
  - [ ] Add tests for report query helpers.
  - [ ] Add tests for export authorization.
  - [ ] Add UI states for report pages (all 4 sub-bullets)
```

---

## Prompt 14: Final Hardening — Rate Card Tests, Security Review, Test Suite, E2E, UAT, Release Readiness

**Purpose**: Close the final hardening pass: Phase 14 rate-card tests, Phase 30 security review, Phase 31 remaining test coverage, Phase 32 E2E lifecycle scenarios, Phase 33 UAT checklist, and Phase 35 release-readiness items.

```md
Run the final hardening pass per Phases 14, 30, 31, 32, 33, and 35 of `.cursor/agent-handoffs/todo.md`.

This prompt is large — split it into the 6 parts below and report progress part-by-part rather than at the end. Do not skip parts.

### Part 1: Phase 14 — Rate Card Tests

Add Vitest tests for the rate card module covering the unchecked sub-bullets:
- Matching date inside range returns the rate
- Matching open-ended range (no valid_to) returns the rate
- Date before range returns no rate
- Date after closed range returns no rate
- Overlap blocked (same route + pricing option + overlapping period) → API error
- Adjacent non-overlap allowed (e.g. ending 2026-05-01 and starting 2026-05-02) → allowed
- Different route can overlap (does not collide)
- Different pricing option can overlap (does not collide)

No code changes expected unless tests reveal bugs.

### Part 2: Phase 30 — Security Review Completion

- Search the changed files in the repo for `any` and replace with proper types where practical; document any unavoidable uses.
- Confirm read-only user cannot mutate: customers, bookings/jobs, quotes, payments, packages, documents, exports. Add tests for each. (`suppliers` and `settings` are already covered.)
- Confirm Consultant cannot manage: users, supplier categories, supplier rates (`supplier rates` already covered). Add tests for each.

### Part 3: Phase 31 — Test Suite Completion

Add unit/integration tests for every Phase 31 unchecked bullet:
- Job/booking number generation (overlaps with Prompt 2 — verify all Phase 8 tests count)
- Customer matching (overlaps with Prompt 10 — verify all Phase 9 tests count)
- Quote tests (verify Prompt 6 coverage)
- Invoice tests (verify Prompt 7 coverage; add any gaps for invoice number formats, due-date logic, status transitions)
- Payment tests (verify Prompt 7 coverage)
- Voucher tests (verify Prompt 8 coverage)
- Permission tests (verify Part 2 above)
- Email ingestion integration tests (likely already covered in Phase 5 — verify and add any missing scenarios)
- Email sending tests (covered across Prompts 6, 7, 8, 11 — verify and add gaps for retry behavior if not covered)
- File storage tests (verify Prompt 9 coverage)
- Backup and restore tests (verify Prompt 13 coverage)
- Error logging tests (verify Prompt 12 coverage)
- Reporting tests (verify Prompt 13 coverage)

After adding any missing tests:
- Run `pnpm test:ci` and confirm pass
- Run `pnpm test:coverage` and review coverage gaps for high-risk workflow logic. Add tests for any 0%-covered critical files.

### Part 4: Phase 32 — End-to-End MVP Scenarios

Add three Vitest E2E lifecycle tests under `tests/e2e/` (create the directory if missing). Use mocked Supabase, mocked email provider, mocked storage. Assert state transitions, audit entries, and final pipeline stage.

E2E Scenario 1: Blue Train enquiry to quote
- Steps: receive Blue Train SA-Rail email fixture → parse → match/create customer → create booking with `BT-YYYY-####` number → consultant claims → consultant resolves review if needed → starts quote → generates quote → sends quote → assert PDF stored, correspondence, audit entries

E2E Scenario 2: Rovos enquiry to voucher
- Full lifecycle: enquiry → quote → accept → deposit invoice → deposit payment → final invoice → final payment → voucher generation → voucher send → Voucher Sent stage → customer last travel date updated → repeat-client flag set on future enquiry → voucher contains modular service blocks

E2E Scenario 3: Cancellation and refund
- Quote accepted → consultant cancels booking → cancellation reason required → `Other` reason requires text → cancellation fee/refund calculated and stored per existing rules → consultant records refund → outcome=Cancelled → audit complete

### Part 5: Phase 33 — UAT Checklist

Create `.cursor/agent-handoffs/uat_checklist.md` with per-role step-by-step UAT scripts (Consultant, Manager, Admin, Read-only), one section per role, each step matching the Phase 33 bullets exactly. This is for the user to execute manually against a running app — do NOT mark Phase 33 todo lines as done. Instead, leave them unchecked and add a top-of-file note in `uat_checklist.md`: "When you complete each role's UAT, return to `todo.md` Phase 33 and check off the steps."

### Part 6: Phase 35 — Release Readiness

Run and confirm the automated items:
- `pnpm test:ci` passes — paste a summary of pass/fail
- `pnpm build` passes — paste a summary
- `pnpm db:reset` applies cleanly — paste any migration errors
- `pnpm db:types` regenerates without diff (run, then check `git status` on `lib/supabase/types.ts`)
- App version bumped at least once for this session

Manual items (leave unchecked, list in the final summary so the user knows to run them):
- Manual smoke test on `http://localhost:3000`
- Settings and roles manually checked
- Email sync tested with safe/test mailbox
- PDF generation tested
- File upload tested
- Backup job tested in non-production
- Restore tested in non-production
- UAT feedback captured
- Final handoff notes written

### Todo lines to mark done:

- Phase 14: all 8 test sub-bullets
- Phase 30: all unchecked bullets (`any` search, read-only mutation list, Consultant management list)
- Phase 31: all unchecked bullets EXCEPT `pnpm test:coverage` if coverage gaps remain unresolved — only mark `Run pnpm test:coverage` and `Review coverage gaps for high-risk workflow logic` after they actually pass and gaps are reviewed
- Phase 32: all 3 E2E scenarios + every sub-bullet within them
- Phase 33: leave all unchecked (UAT is human work). Add the `uat_checklist.md` reference under "All MVP checklist items either complete or explicitly deferred" in Phase 35.
- Phase 35: mark the automated items done after they pass. Leave the manual items unchecked. Mark "All MVP checklist items either complete or explicitly deferred" only after confirming everything in this list is either done or has a deferred-with-reason note in `uat_checklist.md` or `business_decisions.md`.

### Final report:

At the end of this prompt, produce a one-page summary in the response:
- All 14 prompts in this pack: executed (paste prompt name + version bump from/to)
- Total `todo.md` items checked off in this prompt: N
- Total remaining unchecked in `todo.md`: N (with the list — should be only Phase 33 UAT + Phase 35 manual smoke tests)
- Estimated system completeness: 95-99%
- Outstanding human tasks: UAT runthrough, manual smoke tests, final handoff notes
```

---

## After all 14 prompts

Open `.cursor/agent-handoffs/todo.md`. The only unchecked items should be:
- Phase 33 UAT (requires human role-based testing against the running app, guided by `uat_checklist.md`)
- Phase 35 manual smoke tests, mailbox tests, and handoff notes (requires human execution)

Everything else should be checked. The system is at 95-99% complete.

Run `pnpm test:ci`, `pnpm build`, `pnpm db:reset`, and `pnpm db:types` one final time to confirm a clean state, then proceed to UAT.
