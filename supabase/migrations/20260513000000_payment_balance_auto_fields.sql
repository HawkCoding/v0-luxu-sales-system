-- Fix missing ON DELETE CASCADE on payments.booking_id.
-- Without this, deleting a booking leaves orphaned payment rows.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_booking_id_fkey;
ALTER TABLE payments
  ADD CONSTRAINT payments_booking_id_fkey
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
