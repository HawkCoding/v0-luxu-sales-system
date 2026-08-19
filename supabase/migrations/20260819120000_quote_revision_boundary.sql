-- Revise now resets the whole booking back to Enquiry, but correspondence and
-- document rows sent before the revision must stop satisfying the pipeline
-- gates on the re-walk up (the reservation-form ack, deposit invoice email,
-- payment confirmation, voucher email). Rather than deleting that history --
-- it still belongs on the Emails/Documents tabs -- each revision stamps this
-- column, and the gates ignore anything created at or before it.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS revision_reset_at timestamptz;

COMMENT ON COLUMN bookings.revision_reset_at IS
  'Set to now() every time a quote revision resets the booking. Pipeline gates ignore correspondences/documents created at or before this timestamp.';
