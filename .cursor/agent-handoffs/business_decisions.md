# Phase 34 Business Decisions

Resolved on 2026-05-16 for the Luxus Sales System MVP. `bookings` remains the canonical job card entity.

## 1. Quote Validity Default

Question: Should quote validity default to 14 days from the project overview or 30 days from the quote document section?

Current state in code: Quote creation defaults to 14 days in `components/create-quote-dialog.tsx`, quote sending defaults to 14 days in `components/send-quote-dialog.tsx`, imported enquiry auto-draft quotes default to 14 days in `app/api/enquiries/route.ts`, and the customer acceptance tests use a 14-day future validity.

Recommended default: 14 days, because it matches the project overview and the currently implemented UI/API behavior.

Final decision: Quotes are valid for 14 days by default. Store the canonical setting as `app_settings.quote_validity_days = 14`.

Affected files: `components/create-quote-dialog.tsx`, `components/send-quote-dialog.tsx`, `app/api/enquiries/route.ts`, `app/api/quotes/accept-public/[token]/route.ts`, `supabase/seed.sql`, `supabase/migrations/20260516120000_phase_34_business_defaults.sql`.

## 2. Deposit Due Rule And Default

Question: Should deposit due dates be calculated as X days before departure or X days after quote acceptance, and what should the default number of days be?

Current state in code: Deposit invoices are generated with `due_date = now + 7 days` in `app/api/invoices/deposit/route.ts` and in public quote acceptance at `app/api/quotes/accept-public/[token]/route.ts`. This behaves closest to "after quote acceptance" when the invoice is created by acceptance, and the current hard-coded default is 7 days.

Recommended default: 7 days after quote acceptance. This is clearer for customers and aligns with the existing automatic deposit invoice timing.

Final decision: Deposit due dates are based on quote acceptance, not departure date. Default deposit due date is 7 days after quote acceptance. Store the canonical settings as `app_settings.deposit_due_rule = after_quote_acceptance` and `app_settings.deposit_due_days = 7`.

Affected files: `app/api/invoices/deposit/route.ts`, `app/api/quotes/accept-public/[token]/route.ts`, `supabase/seed.sql`, `supabase/migrations/20260516120000_phase_34_business_defaults.sql`.

## 3. Final Payment Default

Question: What should the default number of days before departure be for final payment?

Current state in code: Final invoices currently use `now + 7 days` in `app/api/invoices/final/route.ts`; Phase 19 already states the final payment rule should be configurable as days before departure.

Recommended default: 30 days before departure, a standard travel balance deadline that leaves operational time before supplier commitments.

Final decision: Final payment is due 30 days before departure by default. Store the canonical setting as `app_settings.final_payment_due_days_before_departure = 30`.

Affected files: `app/api/invoices/final/route.ts`, `supabase/seed.sql`, `supabase/migrations/20260516120000_phase_34_business_defaults.sql`.

## 4. Outbound Email Provider

Question: What is the outbound email provider, including incoming server, outgoing server, Outlook Web availability, Microsoft 365 Exchange Online status, and SMTP/app password availability?

Current state in code: Inbound email accounts support configurable IMAP host, port, username, encrypted password/app password, TLS mode, and folders. Outbound sending uses per-salesperson cPanel SMTP accounts stored in `salesperson_credentials`. Mailpit is used in development when `SMTP_FORCE_LIVE` is not set.

Final decision: Outbound email uses per-salesperson SMTP accounts hosted on `mail.sa-rail.co.za`.

- Outbound provider: cPanel SMTP/IMAP
- SMTP host: `mail.sa-rail.co.za`
- SMTP port: `465`
- SMTP encryption: SSL/TLS
- SMTP auth: username/password (not Microsoft 365, OAuth, or app passwords)
- IMAP Sent append host: `mail.sa-rail.co.za`
- IMAP Sent append port: `993`
- IMAP encryption: SSL/TLS
- IMAP credentials: same username/password as SMTP
- Microsoft 365 Exchange Online: not in use
- Outlook Web: available at webmail.sa-rail.co.za but not used by the system

Salesperson email address mapping:
- Carmen de Jongh: `reservations@sa-rail.co.za`
- Leonie Burke: `reservations2@sa-rail.co.za`
- Dirk Retief: `reservations3@sa-rail.co.za`
- Monade van Eeden: `reservations4@sa-rail.co.za`
- Douwlien Leach: `reservations5@sa-rail.co.za`

After a successful SMTP send, the exact sent RFC822 message is appended to the salesperson's IMAP Sent folder. If the IMAP append fails, the email is not resent — the failure is logged for follow-up.

Affected files: `lib/email/smtp-transport.ts`, `lib/email/transport.ts`, `app/api/settings/salesperson-credentials/route.ts`, `supabase/migrations/20260516140000_salesperson_credentials.sql`.

## 5. Voucher Visual Reference Document Location

Question: Where does the voucher visual reference document/template live?

Current state in code: Voucher styling is controlled by the `voucher_template` table, the voucher template editor, and voucher PDF components.

Final decision: The canonical voucher visual reference document is `Travel_Vouchers_(1).docx`, stored under `/docs/voucher-reference/Travel_Vouchers_(1).docx`.

Voucher PDF layout must follow this reference document:
- Formal black-on-white table layout
- Header: `SA-Rail`, `A division of Luxus Travel & Tours`, service tagline, voucher number, title, subtitle, and prepayment note
- Guest information block: names, number of guests, special requests, consultant
- Modular service blocks: rail, transfer, accommodation, and flight-ticket note
- Footer: `End of Services` and page numbering

Implementation must remain modular so additional service providers and service types can be added without hard-coding one-off layouts.

Affected files: `docs/voucher-reference/README.md`, `components/voucher-template-editor.tsx`, `lib/voucher/pdf/voucher-document.tsx`, `lib/voucher/pdf/styles.ts`.

## 6. Backup Storage Location For Production

Question: Where should production backups be stored?

Current state in code: Supabase Storage is already configured and used for private generated documents. No backup worker or backup bucket exists yet.

Recommended default: Supabase Storage private bucket, because it keeps backups inside the current platform boundary and matches the app's existing storage approach.

Final decision: Production backups will be stored in a private Supabase Storage bucket named `backups`. Store the canonical settings as `app_settings.backup_storage_provider = supabase_storage` and `app_settings.backup_storage_bucket = backups`.

OneDrive and Google Drive are deferred. Backup/restore implementation should proceed with Supabase Storage.

Affected files: `supabase/config.toml`, `supabase/seed.sql`, `supabase/migrations/20260516120000_phase_34_business_defaults.sql`.

## 7. Read-Only Export Permissions

Question: May read-only users export reports?

Current state in code: Read-only users can view operational pages, but reporting is limited to admin/manager in `lib/role-context.tsx`. Audit export is also protected by admin/manager server-side access. There is no reporting export route yet.

Recommended default: No. Read-only users should view allowed data only and should not export reports.

Final decision: Read-only users may not export reports. Store the canonical setting as `app_settings.read_only_exports_allowed = false`.

Affected files: `lib/role-context.tsx`, `app/api/audit/export/route.ts`, `app/app/reporting/page.tsx`, `supabase/seed.sql`, `supabase/migrations/20260516120000_phase_34_business_defaults.sql`.

## 8. Payment Reference Number

Question: Should payment reference number be mandatory or optional?

Current state in code: Payment create/update schemas allow `reference` to be null or omitted. Seed payments include references, but the API does not require them.

Recommended default: Optional, because some legitimate card/cash/manual adjustments may not have an external bank reference at capture time.

Final decision: Payment reference number is optional. Store the canonical setting as `app_settings.payment_reference_required = false`.

Affected files: `app/api/payments/route.ts`, `app/api/payments/[id]/route.ts`, `components/job-payments-tab.tsx`, `supabase/seed.sql`, `supabase/migrations/20260516120000_phase_34_business_defaults.sql`.

## 9. Quote Acceptance After Validity Date

Question: Should quote acceptance after the validity date be allowed or blocked?

Current state in code: Public quote acceptance returns an error when `validity_until` is before today. Acceptance-link creation also blocks already expired quotes, and pipeline transition validation blocks quote acceptance when the active sent quote is expired.

Recommended default: Block acceptance after the validity date.

Final decision: Quote acceptance after validity date is blocked. Store the canonical setting as `app_settings.quote_acceptance_after_expiry = blocked`.

Affected files: `app/api/quotes/accept-public/[token]/route.ts`, `app/api/quotes/[id]/acceptance-link/route.ts`, `lib/pipeline/validate-transition.ts`, `supabase/seed.sql`, `supabase/migrations/20260516120000_phase_34_business_defaults.sql`.
