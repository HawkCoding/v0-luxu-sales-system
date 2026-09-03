-- A sync run that does not finish cleanly used to lose the message it was working on. The Vercel
-- Hobby 60s ceiling against ~8s/message meant the in-flight message was killed mid-import; worse,
-- two paths dropped a UID with no row at all (a booking-creation failure deleted the claim "for
-- retry", and a dropped IMAP fetch was skipped silently) while the account cursor still advanced
-- past them -- making those enquiries unrecoverable.
--
-- The sync now records every candidate UID and retries failures by UID, independently of the
-- cursor. That needs two things from the schema: a status for a message whose source never
-- arrived, and a per-message attempt counter so a permanently broken message stops being retried
-- instead of consuming the run budget forever.

ALTER TABLE public.inbound_email_messages
  DROP CONSTRAINT IF EXISTS inbound_email_messages_status_check;

ALTER TABLE public.inbound_email_messages
  ADD CONSTRAINT inbound_email_messages_status_check
  CHECK (status IN (
    'imported_complete',
    'imported_needs_review',
    'failed',
    'fetch_failed',
    'skipped_no_rule',
    'skipped_not_an_enquiry',
    'processing'
  ));

ALTER TABLE public.inbound_email_messages
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.inbound_email_messages.attempts IS
  'Import attempts made for this UID. Rows at or above the sync''s MAX_IMPORT_ATTEMPTS are left for a human instead of being retried automatically.';

-- The retry pass runs at the head of every sync, so keep its lookup off a sequential scan.
CREATE INDEX IF NOT EXISTS inbound_email_messages_retry_idx
  ON public.inbound_email_messages (email_account_id, status)
  WHERE status IN ('failed', 'fetch_failed');
