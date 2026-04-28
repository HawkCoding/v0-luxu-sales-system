ALTER TABLE public.rate_cards
  ADD COLUMN IF NOT EXISTS child_price  numeric(12,2) NULL,
  ADD COLUMN IF NOT EXISTS infant_price numeric(12,2) NULL;
