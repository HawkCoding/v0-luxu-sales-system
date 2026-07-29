-- Manual, discretionary top-up folded into a quote's Commission line.
-- Stored on the quote (not the booking) so each revision can carry its own amount,
-- and so a Build Booking re-price can re-apply it after regenerating the line items.
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS commission_bonus numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.quotes.commission_bonus IS
  'Flat manual amount added on top of the calculated commission and folded into the Commission line item.';
