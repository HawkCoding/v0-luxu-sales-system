-- A subject rule is the only gate the automated import has, and a subject rule is a blunt
-- instrument: an out-of-office auto-reply on an enquiry thread matched one and produced a real
-- customer, a real booking and a draft quote from an email that contained no enquiry at all
-- (4 of the 9 required fields, none of them trip detail). The paste path already refuses this --
-- Save & Open stays disabled below the threshold -- so the automated path now refuses it too and
-- records the message as skipped instead of importing it. Widen the check for the new status.
ALTER TABLE public.inbound_email_messages
  DROP CONSTRAINT IF EXISTS inbound_email_messages_status_check;

ALTER TABLE public.inbound_email_messages
  ADD CONSTRAINT inbound_email_messages_status_check
  CHECK (status IN (
    'imported_complete',
    'imported_needs_review',
    'failed',
    'skipped_no_rule',
    'skipped_not_an_enquiry',
    'processing'
  ));
