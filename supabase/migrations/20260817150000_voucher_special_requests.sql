-- Hand-typed line that prints as SPECIAL REQUESTS on the voucher. Previously that row was
-- machine-assembled from the enquiry's free text plus dietary/medical/occasion/smoking/meal
-- seating; consultants now type exactly what should appear, and the structured fields are
-- routed to the specific supplier category that acts on them instead.
ALTER TABLE booking_reservation_details
  ADD COLUMN IF NOT EXISTS voucher_special_requests text;
