-- QA 02 F02-2: deleting a user with a booking attached failed with
-- "Database error deleting user" because both booking → auth.users foreign keys
-- had no ON DELETE action.
--
-- The API blocks the delete with a 409 before it gets this far; this is the
-- safety net so no other delete path (SQL, admin tooling, cascade from
-- auth.users) can ever surface as a 500 or leave a dangling reference.
-- Matches booking_notes.author_id / payments.captured_by / documents.uploaded_by.

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_assigned_salesperson_id_fkey;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_assigned_salesperson_id_fkey
  FOREIGN KEY (assigned_salesperson_id)
  REFERENCES auth.users (id)
  ON DELETE SET NULL;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_owner_user_id_fkey;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_owner_user_id_fkey
  FOREIGN KEY (owner_user_id)
  REFERENCES auth.users (id)
  ON DELETE SET NULL;
