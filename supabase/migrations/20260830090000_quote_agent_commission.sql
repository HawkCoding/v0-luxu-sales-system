-- Discount given to a booking agency that sells this journey on our behalf.
-- Unlike commission_bonus (Rounding), which is folded invisibly into the Commission line,
-- this is a total-level adjustment the client is meant to see: it prints as its own negative
-- red row on the quote PDF, the quote email block and the invoice PDF.
--
-- Stored as a positive magnitude and subtracted, so quotes.subtotal stays the gross travel
-- price and quotes.total becomes the net the client actually owes. Everything downstream
-- (deposit percentage, invoice balance, outstanding_amount) already reads quotes.total, so it
-- lands on the net figure automatically.
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS agent_commission numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.quotes
  DROP CONSTRAINT IF EXISTS quotes_agent_commission_non_negative;
ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_agent_commission_non_negative CHECK (agent_commission >= 0);

COMMENT ON COLUMN public.quotes.agent_commission IS
  'Positive magnitude of the discount given to a booking agency. Subtracted from subtotal to give total; shown to the client as a negative red line on the quote and invoice.';
