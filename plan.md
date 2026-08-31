# plan.md - Inbound Email Intake for Enquiries

## Summary

Build an IMAP-only inbound email intake system for cPanel/web-hosted mailboxes. Admins manage mailbox accounts and inbound subject rules in Settings. The system reads matching form-submission emails from INBOX, creates enquiries automatically, and marks incomplete imports as `Needs Review`. (As shipped: Vercel Hobby only allows a daily cron, so the actual cadence is a daily `vercel.json` run plus a best-effort `*/15` GitHub Actions workflow — see `.github/workflows/email-sync.yml` — not a true 10-minute schedule.)

Core decisions:
- IMAP only for v1; no POP3.
- Process both read and unread emails.
- Ignore unmatched emails completely.
- First sync imports matching emails from the last 30 days.
- Duplicate mailbox fetches are blocked by IMAP identity: `email_account_id + uidvalidity + uid`.
- Similar client submissions still create separate enquiries, but are flagged as possible duplicates.
- Successful complete imports move to `Processed`; incomplete imports move to `Needs Review`.
- Mailbox credentials are encrypted and stored in the database.

## Key Changes

- Add dependencies with `pnpm`: `imapflow` and `mailparser`.
- Add database support for:
  - inbound email accounts
  - inbound subject rules
  - inbound email message records
  - sync run logs
  - email import review metadata on bookings
- Add encrypted credential handling with `EMAIL_CREDENTIAL_ENCRYPTION_KEY`.
- Add `CRON_SECRET` and a Vercel cron job at `/api/cron/email-sync` (as shipped: daily, per `vercel.json`, supplemented by a best-effort `*/15` GitHub Actions workflow).
- Extend enquiry/booking metadata so email-created records can show:
  - source mailbox
  - subject
  - received timestamp
  - parsed/missing fields
  - possible duplicate flag
  - raw email preview while still in enquiry stage
- Add audit logs for mailbox sync, enquiry creation from email, duplicate warnings, review resolution, customer reassignment, and rejected/deleted imported enquiries.

## Implementation Changes

- Settings:
  - Add "Inbound Email Accounts" management.
  - Fields: email, host, port, SSL/TLS mode, username, password, INBOX folder, processed folder, needs-review folder, enabled.
  - Add "Test connection" and "Sync now".
  - Password is write-only after save.
  - Add "Inbound Email Rules" in Settings for subject patterns; do not put inbound rules in Templates.

- Email sync:
  - Connect with IMAP and scan INBOX by UID, not unread status.
  - On first sync, only inspect messages received in the last 30 days.
  - On later syncs, inspect new UIDs since the last sync.
  - If subject does not match an active inbound rule, ignore the email entirely.
  - Parse text/html body, ignore attachments, and reuse the existing email draft parser.
  - Create a booking in `stage = "enquiry"` with `source = "email"`.
  - If required/expected fields are missing or low-confidence, mark the booking as `Needs Review`.

- Mailbox filing:
  - If booking creation succeeds and is complete: mark read and move to `Processed`.
  - If booking creation succeeds but needs review: mark read and move to `Needs Review`.
  - If database creation fails: leave email in INBOX and log the error.
  - If moving the email fails after booking creation: keep the booking, mark the message as `filing_failed`, and expose a retry action so it never creates a duplicate booking.

- Enquiries:
  - Show `Needs Review` prominently on enquiry cards and booking detail.
  - Block `Needs Review` enquiries from moving beyond the allowed early pipeline step until review is resolved.
  - Allow sales users to delete/reject imported enquiries that are spam, duplicates, or bad imports.
  - Add possible duplicate warning when a new email import closely matches another recent enquiry by email/contact/name/trip within a short window.
  - Add a "Change customer" action on booking detail: search existing customers, assign the booking to one, audit the change, and optionally leave the auto-created customer untouched unless it has no other bookings.

- Raw email retention:
  - Keep raw email body while the booking remains in enquiry/review.
  - Once the enquiry moves forward after quote handling, clear stored raw body from app tables while keeping source metadata and audit history.

## Test Plan

- Unit tests:
  - Subject rule matching.
  - IMAP duplicate identity handling.
  - Parser-to-enquiry payload mapping.
  - `Needs Review` and missing-field metadata.
  - Possible duplicate detection.
  - Credential encryption/decryption.

- API tests:
  - Settings permissions for account and rule management.
  - Cron endpoint rejects missing/invalid `CRON_SECRET`.
  - Manual sync requires Settings access.
  - Duplicate UID does not create a second booking.
  - Customer reassignment updates booking customer and writes audit.

- Manual/integration checks:
  - Add cPanel IMAP account and test connection.
  - Manual sync imports matching read and unread emails.
  - Unmatched emails stay untouched and unrecorded.
  - Complete imports move to `Processed`.
  - Incomplete imports appear in Enquiries as `Needs Review` and move to `Needs Review`.
  - Filing failure can be retried without creating another enquiry.
  - Run `pnpm test:ci` and `pnpm build`.

## Assumptions

- IMAP folders `Processed` and `Needs Review` are created automatically if missing.
- cPanel mailboxes normally use SSL/TLS on port `993`, but Settings allows other IMAP modes.
- Sales staff review the Enquiries page daily, including normal and `Needs Review` cards.
- Incomplete imports create real enquiries and customers immediately; there is no separate review/staging table.
- Code implementation must bump `APP_VERSION` exactly once with `pnpm app:version:bump`.
