-- A subject that matches no active inbound_email_rules used to be skipped with no record at all
-- (lib/inbound-email/sync.ts), and the sync cursor had already advanced past its UID -- the
-- message was silently unrecoverable. Widen the status check so the sync loop can record a row
-- for it instead, visible the same way any other inbound email is.
ALTER TABLE public.inbound_email_messages
  DROP CONSTRAINT IF EXISTS inbound_email_messages_status_check;

ALTER TABLE public.inbound_email_messages
  ADD CONSTRAINT inbound_email_messages_status_check
  CHECK (status IN ('imported_complete', 'imported_needs_review', 'failed', 'skipped_no_rule'));
