# Luxus Sales System — UAT Checklist

> **How to use this checklist**
>
> Run each section as the named role on a clean local environment:
> 1. `pnpm db:reset` to apply migrations and seed.
> 2. `pnpm dev` to start the app on `http://localhost:3000`.
> 3. Log in with the role-specific seeded credentials (see `supabase/seed.sql` /
>    `lib/seed-data.ts`).
> 4. Tick each step in this file as you go.
> 5. Mirror the result into the matching Phase 33 bullet in
>    `.cursor/agent-handoffs/todo.md`.
> 6. If a step fails, stop and capture screenshot + console log in
>    `.cursor/agent-handoffs/uat-findings/` (create the folder on first failure)
>    before continuing.
>
> Each step is `Action` (what you do) + `Expect` (what you should observe and where
> to verify it). Every "audit row appears" step can be verified at
> **Settings → Audit Log**. Every error/warning step can be verified at
> **Settings → Error Log** (introduced in parent-plan Phase 1).

---

## 1. Consultant UAT

Login: consultant role (e.g. `consultant@luxus.test`).

### 1.1 Find new enquiries (`todo.md` line 1123)

- [ ] **1.1.1** Action: Navigate to **Pipeline → New Enquiry** column.
      Expect: Unassigned, unread enquiries are visible with sender, subject, and timestamp.

- [ ] **1.1.2** Action: Apply the search box with a known sender email substring.
      Expect: List narrows to matching enquiries only.

### 1.2 Claim jobs (`todo.md` line 1124)

- [ ] **1.2.1** Action: Open an unclaimed enquiry and click **Claim**.
      Expect: Job card shows your name as owner; the enquiry moves out of the unclaimed pool for other consultants; an audit row `booking_claimed` appears.

### 1.3 Release own claimed jobs (`todo.md` line 1125)

- [ ] **1.3.1** Action: On a job you claimed, click **Release**.
      Expect: Owner clears; job returns to the unclaimed pool; audit row `booking_released` appears.

- [ ] **1.3.2** Action: Try to release a job claimed by another consultant.
      Expect: The Release control is hidden or returns 403 — only the owner (or a Manager) can release.

### 1.4 Start quote (`todo.md` line 1126)

- [ ] **1.4.1** Action: On a claimed job in `new_enquiry` stage, click **Start Quote**.
      Expect: Job transitions to `quote_in_progress`; quote draft is created with reference `BT-YYYY-####` or `RR-YYYY-####` based on product; audit row `quote_created` appears.

### 1.5 Edit missing fields (`todo.md` line 1127)

- [ ] **1.5.1** Action: Open the quote draft and fill any flagged missing fields (passengers, travel date, package selections).
      Expect: Save succeeds; missing-field warnings clear; the quote moves toward "Ready to generate" state.

### 1.6 Generate quote (`todo.md` line 1128)

- [ ] **1.6.1** Action: Click **Generate Quote PDF**.
      Expect: PDF renders and is stored in the documents bucket; document row appears under the job's Documents tab; audit row `quote_pdf_generated` appears.

- [ ] **1.6.2** Action: Generate a second version after editing the quote.
      Expect: Reference suffix increments (e.g. `Q1` → `Q2`); the previous version stays accessible.

### 1.7 Send quote email (`todo.md` line 1129)

- [ ] **1.7.1** Action: Click **Send Quote** and confirm the dialog.
      Expect: Email is sent via the salesperson's outbound credentials; `quotes.last_sent_at` updates; correspondence row appears in the job's Correspondence tab; audit row `quote_sent` appears; stage transitions to `quote_sent`.

### 1.8 Record payment (`todo.md` line 1130)

- [ ] **1.8.1** Action: After deposit invoice is generated, open **Payments → New Payment**, enter amount and reference, and submit.
      Expect: Payment row is created; invoice balance recalculates; if deposit amount is met, stage advances to `deposit_paid`; audit row `payment_recorded` appears.

### 1.9 Upload proof of payment (`todo.md` line 1131)

- [ ] **1.9.1** Action: From the payment row, click **Upload Proof** and attach a PDF or image.
      Expect: File uploads to the documents bucket; the payment row shows a link; audit row `pop_uploaded` appears.

### 1.10 Generate voucher when gates pass (`todo.md` line 1132)

- [ ] **1.10.1** Action: With `invoice_balance = 0` and all required suppliers booked, navigate to the job's Voucher tab and click **Generate Voucher**.
      Expect: Voucher PDF renders; document row appears; stage advances to `voucher_sent` (or the voucher-ready intermediate state); audit row `voucher_generated` appears.

### 1.11 Cannot generate voucher when gates fail (`todo.md` line 1133)

- [ ] **1.11.1** Action: On a job with `invoice_balance > 0`, attempt to open the voucher generator.
      Expect: Button is disabled with a tooltip explaining the gate (e.g. "Balance must be zero"); API call returns 400/409 if invoked directly.

- [ ] **1.11.2** Action: On a job with missing supplier confirmations, attempt to generate the voucher.
      Expect: Same gate behaviour — clear blocker message; no voucher PDF created.

---

## 2. Manager UAT

Login: manager role (e.g. `manager@luxus.test`).

### 2.1 Edit templates (`todo.md` line 1135)

- [ ] **2.1.1** Action: Navigate to **Settings → Templates**, edit the quote-send template, save.
      Expect: Save succeeds; reopening the template shows the new content; audit row `template_updated` appears.

### 2.2 Manage suppliers (`todo.md` line 1136)

- [ ] **2.2.1** Action: **Settings → Suppliers → New Supplier**, fill the form, save.
      Expect: Supplier appears in the list; audit row `supplier_created` appears.

- [ ] **2.2.2** Action: Edit an existing supplier's email and save.
      Expect: List reflects the change; audit row `supplier_updated` appears.

### 2.3 Manage rates (`todo.md` line 1137)

- [ ] **2.3.1** Action: **Settings → Rates**, create a new rate row for an existing rate type.
      Expect: Save succeeds; row appears; audit row `rate_created` appears.

- [ ] **2.3.2** Action: Attempt to create an overlapping rate (same product + date range).
      Expect: Server rejects with a 400/409 and a clear "rate overlap" error message; no audit row written.

### 2.4 View reports (`todo.md` line 1138)

- [ ] **2.4.1** Action: Navigate to **Reporting**. Apply filters: date range, consultant, product.
      Expect: Each report (sales per salesperson, conversion rate, revenue per product, outstanding payments, enquiries by source) renders rows; URL contains the filter query params; loading/empty states render correctly.

- [ ] **2.4.2** Action: Click **Download CSV** on any report.
      Expect: CSV downloads with header row + filtered rows.

### 2.5 Reassign jobs (`todo.md` line 1139)

- [ ] **2.5.1** Action: Open a job claimed by another consultant; use the **Reassign** action to assign to a different consultant.
      Expect: Owner field updates; audit row `booking_reassigned` (or equivalent) appears with before/after consultant ids.

### 2.6 Resolve errors (`todo.md` line 1140)

- [ ] **2.6.1** Action: Navigate to **Settings → Error Log**. Confirm the unresolved-count badge in the settings nav matches the filter count.
      Expect: Counts match; list shows severity, source, message, created-at.

- [ ] **2.6.2** Action: Open an unresolved error, click **Resolve**.
      Expect: Row moves to resolved state with `resolved_by = your user id` and `resolved_at` set; unresolved badge decrements; audit row `error_resolved` appears.

---

## 3. Admin UAT

Login: admin role (e.g. `admin@luxus.test`).

### 3.1 Create users (`todo.md` line 1142)

- [ ] **3.1.1** Action: **Settings → Users → New User**, fill name/email/role, send invite.
      Expect: User row appears; invitation email is sent (visible in dev inbox / outbound queue); audit row `user_created` appears.

### 3.2 Configure company details (`todo.md` line 1143)

- [ ] **3.2.1** Action: **Settings → Company**, change company name and address, save.
      Expect: Save succeeds; new values reflected on quote/invoice/voucher PDFs generated afterward; audit row `company_settings_updated` appears.

### 3.3 Configure email accounts (`todo.md` line 1144)

- [ ] **3.3.1** Action: **Settings → Email Accounts**, add an SMTP account (test credentials), click **Test Connection**.
      Expect: Test returns success; account row saved with encrypted credentials; audit row `email_account_created` appears.

- [ ] **3.3.2** Action: Trigger an inbound sync from the same screen.
      Expect: Sync runs; status reports messages fetched; any parse warnings appear in **Settings → Error Log** at `Warning` severity.

### 3.4 Configure backup/restore (`todo.md` line 1145)

- [ ] **3.4.1** Action: **Settings → Backups**, click **Create Backup Now**.
      Expect: Backup file appears in the list with size and timestamp; `backup_records` row inserted; audit row `backup_created` appears.

- [ ] **3.4.2** Action: Click **Download** on the new backup.
      Expect: JSON snapshot downloads; opening it shows all expected tables (incl. those expanded in parent-plan Phase 3).

### 3.5 Restore from backup (`todo.md` line 1146)

> **Local / non-prod only.** Never run on production data.

- [ ] **3.5.1** Action: Make a small, reversible change (e.g. edit a supplier's email). Then open the backup created in 3.4 and click **Restore**.
      Expect: Dialog requires you to type the backup id into the confirmation field; **Restore** button stays disabled until the typed token matches exactly.

- [ ] **3.5.2** Action: Type the correct token and confirm.
      Expect: Restore succeeds atomically; supplier email reverts to the pre-edit value; audit row `backup_restored` appears; any failure produces a `Critical` row in **Settings → Error Log** and a sanitized 500 to the client.

- [ ] **3.5.3** Action: As **Manager** (not Admin), attempt to access the restore endpoint.
      Expect: 403 — restore is Admin-only.

### 3.6 Manage global settings (`todo.md` line 1147)

- [ ] **3.6.1** Action: **Settings → Global**, toggle `deposit_refundable`, save.
      Expect: Save succeeds; subsequent cancellation flows use the new value when computing forfeit-deposit refunds (verify by spot-checking a `deposit_paid` cancellation); audit row `settings_updated` appears with the key/before/after.

- [ ] **3.6.2** Action: Toggle `read_only_exports_allowed`, save.
      Expect: Read-only users' "Download CSV" buttons hide/disable accordingly without a page refresh on next nav.

- [ ] **3.6.3** Action: Edit quote-follow-up cadence (e.g. `[3,7]` → `[5,10]`).
      Expect: Save succeeds; next worker run uses the new cadence; audit row `settings_updated` appears.

---

## 4. Read-only UAT

Login: read-only role (e.g. `readonly@luxus.test`).

### 4.1 Can view allowed pages (`todo.md` line 1149)

> Read-only's allowed pages **exclude Reporting and the Audit Log** — both are
> manager+ surfaces and are hidden from the read-only sidebar.

- [ ] **4.1.1** Action: Navigate to Pipeline, Jobs list, a specific job, Customers, Documents.
      Expect: Each page renders in read-only mode; no create/edit/send buttons are visible.

- [ ] **4.1.2** Action: Check the read-only sidebar for Reporting and Audit Log links.
      Expect: Neither link is shown (Reporting/Audit are manager+). The export API gate is
      still covered by §4.2.3 (`/api/reports/.../export` returns 403 while
      `read_only_exports_allowed = 'false'`).

### 4.2 Cannot create, edit, delete, send, export, or manage settings/users (`todo.md` line 1150)

- [ ] **4.2.1** Action: Attempt to claim an enquiry (direct UI click).
      Expect: Button hidden or 403 from the API.

- [ ] **4.2.2** Action: Attempt to navigate to **Settings → Users**, **Settings → Suppliers**, **Settings → Templates**, **Settings → Backups**, **Settings → Global**.
      Expect: Each route either redirects away or renders a 403 page.

- [ ] **4.2.3** Action: With `read_only_exports_allowed = 'false'`, call
      `/api/reports/outstanding/export?format=csv` directly via the URL bar.
      Expect: 403 with `{ error: ... }`.

- [ ] **4.2.4** Action: Toggle `read_only_exports_allowed = 'true'` (as Admin), log back in as read-only, retry the export.
      Expect: CSV downloads.

- [ ] **4.2.5** Action: Attempt to POST to any mutating endpoint (e.g. `/api/customers`) via the browser devtools.
      Expect: 403.

---

## Sign-off

- [ ] All four role sections complete with no unresolved failures.
- [ ] Failures (if any) captured in `.cursor/agent-handoffs/uat-findings/`.
- [ ] Matching Phase 33 bullets in `todo.md` ticked to mirror this file.
- [ ] Phase 35 "UAT feedback captured" line ticked once findings are summarised in
      `final-release-handoff.md`.
