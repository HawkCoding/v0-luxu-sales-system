-- A fingerprint of the booking data an issued document was printed from, taken at the moment it was
-- emailed. Compared against the booking as it is now to answer "has this changed since it was sent?".
-- Nullable: copies kept before this column existed (and any whose fingerprint could not be taken)
-- have none, and are reported as "unknown" rather than "changed".
-- Idempotent.

ALTER TABLE public.document_versions
  ADD COLUMN IF NOT EXISTS content_fingerprint text;

NOTIFY pgrst, 'reload schema';
