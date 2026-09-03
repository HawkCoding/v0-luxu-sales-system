-- Standalone products: a booking whose primary supplier is not a train.
--
-- Luxus sells three products. Two are rail journeys (Blue Train, Rovos Rail); the third,
-- Kruger Shalati - Train on the Bridge, is a stationary train carriage sold as a hotel --
-- per room, per night, check-in/check-out, no route and no departure. It has always existed
-- here as a hotel_property with its own room types, meal plan and rate cards, but it could
-- never be a booking's primary product because every intake path filtered on
-- kind = 'train_operator'.
--
-- Three columns fix that:
--
--   suppliers.sells_standalone   Which suppliers may head a booking. TRUE for every train
--                                operator and for Shalati; the other nine hotel_property rows
--                                (Ivory Manor, Taj, ...) stay FALSE because they are add-on
--                                stays hanging off a rail journey, never the product itself.
--                                Drives the New Enquiry supplier dropdown, the inbound-email
--                                supplier scan, and enquiry validation. Ticking the next
--                                standalone product is a checkbox, not a migration.
--
--   suppliers.email_match_phrases  Comma-separated wording to look for in an enquiry email's
--                                subject and body. NULL (the default) derives the phrases from
--                                the supplier's own name -- the full name plus the brand
--                                segment before a " - ", so "Kruger Shalati - Train on the
--                                Bridge" also answers to "Kruger Shalati", which is how the
--                                Gravity form names it ("New submission from Kruger Shalati
--                                Enquiry - Kluever"). Same blank-means-default contract as
--                                suite_phrase_pattern.
--
--   bookings.primary_supplier_id  The supplier a booking is FOR. Until now the train operator
--                                lived only in extracted_json.resolvedReferences.supplierId
--                                (unqueryable) while hotels had hotel_supplier_id, so
--                                "Shalati booking" and "train booking whose operator failed to
--                                resolve" were indistinguishable -- which matters the moment
--                                hotel-only bookings become legal. It also decides which leg is
--                                the core one that cannot be excluded from a quote or voucher.

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS sells_standalone boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_match_phrases text;

COMMENT ON COLUMN public.suppliers.sells_standalone IS
  'Whether this supplier may be a booking''s primary product. TRUE for train operators and for hotels sold on their own (Kruger Shalati); FALSE for add-on hotels, transfers and tours.';

COMMENT ON COLUMN public.suppliers.email_match_phrases IS
  'Comma-separated wording to match in an enquiry email''s subject or body. NULL derives phrases from the supplier name (full name plus the segment before a " - ").';

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS primary_supplier_id uuid REFERENCES public.suppliers(id);

COMMENT ON COLUMN public.bookings.primary_supplier_id IS
  'The supplier this booking is for -- the train operator, or the hotel on a standalone hotel booking. Backfilled from extracted_json.resolvedReferences.supplierId.';

CREATE INDEX IF NOT EXISTS idx_bookings_primary_supplier_id
  ON public.bookings(primary_supplier_id);

-- Slug first, name as the fallback in case a hosted environment slugged it differently.
UPDATE public.suppliers
SET sells_standalone = true
WHERE sells_standalone = false
  AND (
    kind = 'train_operator'
    OR slug = 'kruger-shalati-train-on-the-bridge'
    OR (kind = 'hotel_property' AND name ILIKE '%kruger shalati%')
  );

UPDATE public.bookings b
SET primary_supplier_id = s.id
FROM public.suppliers s
WHERE b.primary_supplier_id IS NULL
  AND s.id = NULLIF(b.extracted_json -> 'resolvedReferences' ->> 'supplierId', '')::uuid;

NOTIFY pgrst, 'reload schema';
