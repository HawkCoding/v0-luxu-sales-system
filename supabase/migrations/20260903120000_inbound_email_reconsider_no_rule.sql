-- `skipped_no_rule` was stored as a terminal status, but it never was one: it records that no
-- active subject rule claimed the message at the moment it was first seen. Adding a rule
-- afterwards changed nothing, because the row already existed and the dedupe check in
-- filterAlreadyProcessed only looks at row existence -- so the UID was logged as
-- "Duplicate emails ignored" on every subsequent run and the enquiry never landed. Observed in
-- production on info@sa-rail.co.za, UID 118536: a Kruger Shalati enquiry that arrived before its
-- subject rule was created.
--
-- The sync's retry pass now also reconsiders `skipped_no_rule` rows whose recorded subject matches
-- a currently-active rule. That lookup needs an index of its own: the existing retry index is
-- partial over ('failed', 'fetch_failed') only, so the widened pass would fall back to a seq scan
-- inside the run's wall-clock budget.
--
-- Deliberately a second index rather than a replacement -- the failure lookup and the reconsider
-- lookup are separate queries (failures keep first claim on the run's slots), so each keeps its own
-- narrow partial index.

CREATE INDEX IF NOT EXISTS inbound_email_messages_no_rule_reconsider_idx
  ON public.inbound_email_messages (email_account_id, uidvalidity, uid DESC)
  WHERE status = 'skipped_no_rule' AND booking_id IS NULL;

COMMENT ON INDEX public.inbound_email_messages_no_rule_reconsider_idx IS
  'Backs the sync retry pass''s reconsider lookup for messages skipped because no subject rule existed yet. Scanned newest-first; subject matching happens in application code because contains/exact/regex rules are not a SQL predicate.';
