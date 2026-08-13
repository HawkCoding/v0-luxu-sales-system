-- Multi-currency quoting: a quote is denominated in exactly one currency.
--
-- Foreign supplier rates (rate_cards.currency) are converted INTO this currency when the quote
-- is built, and the rate used is stamped onto each line's pricing_snapshot. The client only
-- ever sees this one currency; the conversion provenance stays internal.
--
-- Idempotent so it can be applied to local databases in any state.

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ZAR';

-- Every existing quote was priced in rand, so the default is already correct for them.
COMMENT ON COLUMN public.quotes.currency IS
  'The single currency this quote is denominated in. Line items, subtotal and total are all in it.';

-- Manual per-leg prices (manual-pricing legs and transfer/rental price overrides) have no rate
-- card to take a currency from, so the leg carries its own. Defaults to the base currency,
-- which is what every existing typed price already meant.
ALTER TABLE public.booking_services
  ADD COLUMN IF NOT EXISTS price_currency text NOT NULL DEFAULT 'ZAR';

COMMENT ON COLUMN public.booking_services.price_currency IS
  'Currency of this leg''s hand-typed prices (manual_adult_price etc. and transport price_override). Converted into the quote currency at build time.';
