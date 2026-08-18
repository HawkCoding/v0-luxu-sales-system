-- Diagnostics for which body part getMessageBody() chose. Before this, a body-selection mistake
-- was invisible: the rejected candidate was discarded in memory and never persisted anywhere, so
-- diagnosing the production incident where the mailbox switched (Gmail -> info@sarail.co.za) and
-- the text/plain part came back flowed into unstructured paragraphs took reading raw_text off an
-- already-imported booking by hand. body_part records which candidate parsed the message;
-- alt_body_preview keeps a preview of the one that lost, so the next mailbox-shaped surprise is
-- visible without that.
ALTER TABLE public.inbound_email_messages
  ADD COLUMN IF NOT EXISTS body_part text,
  ADD COLUMN IF NOT EXISTS alt_body_preview text;

ALTER TABLE public.inbound_email_messages
  DROP CONSTRAINT IF EXISTS inbound_email_messages_body_part_check;

ALTER TABLE public.inbound_email_messages
  ADD CONSTRAINT inbound_email_messages_body_part_check
  CHECK (body_part IS NULL OR body_part IN ('text', 'html', 'none'));

COMMENT ON COLUMN public.inbound_email_messages.body_part IS
  'Which body candidate getMessageBody() parsed: text/plain, the flattened text/html, or neither. Null for rows recorded before this column existed.';
COMMENT ON COLUMN public.inbound_email_messages.alt_body_preview IS
  'Preview (createRawEmailPreview, 5000 chars) of the body candidate that was NOT chosen, when both existed. Null when there was only one candidate.';
