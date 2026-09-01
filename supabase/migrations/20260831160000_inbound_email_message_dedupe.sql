-- Dedupe was keyed on (email_account_id, uidvalidity, uid) alone, which assumes a message keeps its
-- UID. Production disproved that: fourteen enquiries left the INBOX and came back under fresh UIDs
-- (identical RFC Message-IDs), read as new mail, and produced fourteen duplicate bookings
-- (LTT-2026-0032 .. LTT-2026-0045) in a single morning. The booking-level duplicate detector flagged
-- every one of them for review, but flagging happens after the booking already exists.
--
-- The Message-ID survives a move, a re-delivery and a UIDVALIDITY reset, so the sync now checks it
-- before claiming a UID. A message recognised that way is recorded and skipped rather than imported.

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
    'skipped_duplicate_message',
    'processing'
  ));

-- The lookup runs once per message inside the run's wall-clock budget, so it must not be a seq scan.
CREATE INDEX IF NOT EXISTS inbound_email_messages_message_id_idx
  ON public.inbound_email_messages (email_account_id, message_id)
  WHERE message_id IS NOT NULL;
