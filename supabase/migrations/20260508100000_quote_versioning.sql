ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS quote_number text,
  ADD COLUMN IF NOT EXISTS parent_quote_id uuid REFERENCES public.quotes(id);

CREATE INDEX IF NOT EXISTS idx_quotes_parent_quote_id
  ON public.quotes(parent_quote_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_quote_number_unique
  ON public.quotes(quote_number)
  WHERE quote_number IS NOT NULL;
