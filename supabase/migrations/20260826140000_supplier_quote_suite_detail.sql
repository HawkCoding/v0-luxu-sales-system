-- Per-supplier control of how much suite detail the quote itinerary sentence states.
--
-- 'type_only' (default): the quote PDF/email itinerary line reads "in a Deluxe Suite" -- the
-- suite type name alone. 'full': it states the whole configuration, e.g. "in a Double bedded
-- Deluxe Suite with a shower, Lengthways" (today's only behaviour, before this column existed).
--
-- This governs the quote itinerary sentence only (lib/quotes/quote-presentation.ts). The
-- voucher's "Suite Type" row, the invoice view and the worksheet always state the full
-- configuration regardless of this setting -- that detail is operational, not client wording.

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS quote_suite_detail text NOT NULL DEFAULT 'type_only';

ALTER TABLE public.suppliers
  DROP CONSTRAINT IF EXISTS suppliers_quote_suite_detail_check;
ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_quote_suite_detail_check
  CHECK (quote_suite_detail IN ('type_only', 'full'));

NOTIFY pgrst, 'reload schema';
