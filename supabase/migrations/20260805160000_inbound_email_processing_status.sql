-- The IMAP sync now claims a UID by inserting its inbound_email_messages row *before* creating
-- the booking (lib/inbound-email/sync.ts), so a crash mid-import can't produce a duplicate booking
-- on retry -- the unique key on (email_account_id, uidvalidity, uid) makes the claim atomic. The
-- claim needs a transient status to sit in until the booking result is known. Widen the check.
ALTER TABLE public.inbound_email_messages
  DROP CONSTRAINT IF EXISTS inbound_email_messages_status_check;

ALTER TABLE public.inbound_email_messages
  ADD CONSTRAINT inbound_email_messages_status_check
  CHECK (status IN ('imported_complete', 'imported_needs_review', 'failed', 'skipped_no_rule', 'processing'));
