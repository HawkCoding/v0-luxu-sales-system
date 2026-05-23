# Email, Voucher Reference, and Backup Plan

Last updated: 2026-05-16

This plan turns the newly confirmed SA-Rail business decisions into implementation batches. `bookings` remains the canonical job card entity. Do not store SMTP passwords in source control or committed `.env` files.

## Summary

Confirmed decisions now available:

- Outbound email uses per-salesperson SMTP accounts on `mail.sa-rail.co.za`.
- Sent emails must be appended to the salesperson's IMAP Sent folder after SMTP send.
- Voucher visual reference is `Travel_Vouchers_(1).docx`, to be stored under `/docs/voucher-reference/`.
- Production backup storage is Supabase Storage using a private `backups` bucket.

The next implementation work should be split into small batches so the email architecture supports quotes, invoices, vouchers, follow-ups, and reminders from the start, while releasing quote email first.

## Batch 1: Confirm Decisions And Defaults

Update `.cursor/agent-handoffs/business_decisions.md` with the confirmed details:

- Outbound provider: cPanel SMTP/IMAP.
- SMTP host: `mail.sa-rail.co.za`.
- SMTP port: `465`.
- SMTP encryption: SSL/TLS.
- SMTP auth: username/password, not Microsoft 365, OAuth, or SPA.
- IMAP Sent append host: `mail.sa-rail.co.za`.
- IMAP Sent append port: `993`.
- IMAP encryption: SSL/TLS.
- IMAP credentials: same username/password as SMTP.
- Voucher reference: `Travel_Vouchers_(1).docx`.
- Backup storage provider: Supabase Storage.
- Backup bucket: private `backups` bucket.

Update `.cursor/agent-handoffs/todo.md`:

- Mark outbound email provider and all provider sub-bullets done once the decisions above are recorded.
- Mark voucher visual reference document location done once the document is committed under `/docs/voucher-reference/`.
- Mark backup storage location done once `business_decisions.md` records Supabase Storage as the final provider.

## Batch 2: Salesperson SMTP Credentials

Add a server-only credential model for salesperson mailboxes:

- One credential record per salesperson email address.
- Map system users to the confirmed salesperson email addresses:
  - Carmen de Jongh: `reservations@sa-rail.co.za`
  - Leonie Burke: `reservations2@sa-rail.co.za`
  - Dirk Retief: `reservations3@sa-rail.co.za`
  - Monade van Eeden: `reservations4@sa-rail.co.za`
  - Douwlien Leach: `reservations5@sa-rail.co.za`
- Store passwords in Supabase, encrypted or otherwise protected server-side.
- Never expose SMTP passwords to the client.
- Use `createSessionClient()` for user-scoped reads/writes and `createServiceClient()` only for intentional server-only RLS bypass.

Add admin UI under Settings:

- Admin/manager can view salesperson mailbox records.
- Authorised user can update a salesperson's SMTP/IMAP password without redeploying.
- UI must not display existing password values.
- Include a test-connection action that validates SMTP and IMAP credentials.

Add Zod validation at all new API boundaries and return errors as `{ error: string, details?: unknown }`.

## Batch 3: Email Transport And Sent Items

Replace the current production Resend assumption with a provider abstraction that supports cPanel SMTP/IMAP:

- Resolve the sender from the assigned salesperson on the current booking.
- Send via SMTP using the salesperson credential.
- Build a complete RFC822 message for each outbound email.
- After successful SMTP send, append the exact sent message to the IMAP Sent folder.
- If SMTP succeeds but IMAP append fails, do not resend the email. Record/log the Sent append failure for follow-up.
- Keep local development routed to Mailpit/Inbucket unless live SMTP is explicitly configured.

Release order:

- Batch 1 email type: quote emails to clients.
- Later email types must reuse the same transport: invoices, vouchers, follow-ups, and reminders.

Audit/logging:

- Store correspondence metadata after successful send.
- Include sender, recipients, subject, related booking, and attachment/document IDs where relevant.
- Do not store SMTP passwords or raw credentials in logs.

## Batch 4: Voucher Reference And Voucher PDF Direction

Store the client reference document:

- Add `Travel_Vouchers_(1).docx` under `/docs/voucher-reference/`.
- Document in `business_decisions.md` that this is the canonical voucher visual reference.

Use the reference to guide future voucher PDF work:

- Formal black-on-white table layout.
- Header: `SA-Rail`, `A division of Luxus Travel & Tours`, service tagline, voucher number, title, subtitle, and prepayment note.
- Guest information block: names, number of guests, special requests, consultant.
- Modular service blocks: rail, transfer, accommodation, and flight-ticket note.
- Footer: `End of Services` and page numbering.

Keep the implementation modular so additional service providers and service types can be added without hard-coding one-off layouts.

## Batch 5: Supabase Storage Backup Implementation

Implement backup/restore against Supabase Storage as the final production backup target:

- Create/use a private Supabase Storage bucket named `backups`.
- Store timestamped backup snapshots under a predictable folder/key convention.
- Use server-side access only for backup creation, listing, download, retention cleanup, and restore.
- Do not expose public backup URLs.

Confirmed backup parameters:

- Frequency: daily automated backup.
- Retention: 14 days minimum.
- Restore access: admin-only.
- Restore workflow: explicit confirmation required before destructive restore.

OneDrive and Google Drive are deferred. They should not block Prompt 13 backup/restore implementation.

## Verification Checklist

Before closing this plan:

- `business_decisions.md` matches the confirmed email and voucher details.
- Phase 34 outbound email and voucher reference todo lines are checked only after the corresponding file updates are complete.
- Backup storage todo is checked once `business_decisions.md` records Supabase Storage as the confirmed provider.
- `pnpm test:ci` passes after implementation batches that touch code.
- Run `pnpm build` when routing, build config, or shared types change.
- Bump `APP_VERSION` exactly once in any implementation session that changes code.
