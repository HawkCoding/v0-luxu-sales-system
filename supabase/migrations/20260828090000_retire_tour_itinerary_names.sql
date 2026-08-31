-- A tour operator's itinerary has no name of its own -- the app used to derive one by copying
-- the linked tour type's name onto routes.name. That copy is what let an itinerary read like
-- (and, once a mismatched itinerary was stamped on the wrong leg, be mistaken for) a different
-- tour than the one actually booked: an invoice printing "Helicopter Flight 12/13 minutes -
-- Zimbabwe" for a leg booked as "Sundowner Cruise - Zimbabwe".
--
-- The app no longer writes that copy (see app/api/suppliers/[slug]/route.ts), and client
-- documents now read the tour type off booking_service_units.suite_type_id instead (see
-- lib/invoices/describe-invoice-line.ts). This clears the copies already stored.
--
-- The name is set to the route's own id rather than blanked. routes.name is NOT NULL and carries
-- UNIQUE (name, supplier_id) (see 20260426110000_packages_multileg.sql); a supplier has one
-- itinerary per tour type but many tour types, so blanking them all would collide on that
-- constraint. The id is unique by definition and is never rendered -- an itinerary has no name
-- field in the supplier editor, and no client document reads routes.name for a tour.
--
-- Only rows whose name still exactly matches their linked tour type's name are touched, so a
-- hand-typed name from before the tour-type-pricing cutover survives untouched. Idempotent: a
-- second run matches nothing, because the name no longer equals the tour type's name.

UPDATE public.routes r
SET name = r.id::text
FROM public.suppliers s, public.suite_types st
WHERE r.supplier_id = s.id
  AND s.kind = 'tour_operator'
  AND r.suite_type_id = st.id
  AND r.name = st.name;
