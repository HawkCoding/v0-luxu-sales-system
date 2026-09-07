-- Backfill for QA finding F-P2-3: the enquiry-intake and inbound-email booking inserts wrote
-- route_id but never route_reversed, so bookings.route_reversed silently fell to its schema
-- default (false) while the same computed value was correctly persisted onto the primary leg's
-- booking_services row. Documents that read bookings.route_reversed (itinerary PDF, email
-- {{direction}} tokens, voucher-send, pipeline auto-close) could then disagree with the leg the
-- booking was built from. The intake code paths are fixed separately; this repairs bookings
-- created before that fix.
--
-- One-directional (false -> true only) and idempotent: it can never undo a value
-- syncBookingRoute (lib/quotes/resolve-primary-route.ts) has since corrected via a quote save.
UPDATE public.bookings b
SET route_reversed = true
FROM (
  SELECT DISTINCT ON (booking_id) booking_id, route_id, route_reversed
  FROM public.booking_services
  WHERE route_id IS NOT NULL
  ORDER BY booking_id, sort_order
) s
WHERE s.booking_id = b.id
  AND b.route_id IS NOT NULL
  AND s.route_id = b.route_id
  AND s.route_reversed = true
  AND b.route_reversed = false;
