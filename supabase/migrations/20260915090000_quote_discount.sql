-- Client-facing discount, alongside the internal Commission line and the agency's
-- Agent Commission. Typed the same way as Commission (percent / per_person / fixed),
-- but subtracted at the same final step as Agent Commission rather than affecting what
-- Commission is calculated on: total = subtotal - agent_commission - discount_amount.
--
-- discount_amount is stored rather than recomputed on read: percent/per_person amounts
-- depend on the subtotal/passenger count at save time, the same reason quote_line_items
-- stores a Commission line's calculated amount instead of its type/value alone.
--
-- discount_visible controls only whether the "Discount: -Rxxx" line prints on the quote
-- PDF, quote email and invoice -- the total is reduced either way.
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS discount_type text;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS discount_value numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS discount_visible boolean NOT NULL DEFAULT true;

ALTER TABLE public.quotes
  DROP CONSTRAINT IF EXISTS quotes_discount_value_non_negative;
ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_discount_value_non_negative CHECK (discount_value >= 0);

ALTER TABLE public.quotes
  DROP CONSTRAINT IF EXISTS quotes_discount_amount_non_negative;
ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_discount_amount_non_negative CHECK (discount_amount >= 0);

COMMENT ON COLUMN public.quotes.discount_type IS
  'percent | per_person | fixed, or null when no discount is set. Mirrors quote_line_items.pricing_snapshot.commission.type.';
COMMENT ON COLUMN public.quotes.discount_amount IS
  'Computed deduction in the quote currency. subtotal - agent_commission - discount_amount = total. Shown to the client as a red line only when discount_visible.';
COMMENT ON COLUMN public.quotes.discount_visible IS
  'Whether the Discount line prints on the quote PDF/email and invoice. The total is reduced either way.';
