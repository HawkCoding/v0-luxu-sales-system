-- Multi-currency quoting: exchange-rate cache.
--
-- One row per currency pair holding only the LATEST rate. There is deliberately no history
-- table: the rate a quote was actually priced at is stamped onto each quote line's
-- pricing_snapshot, so a sent quote never reprices when this cache refreshes.
--
-- Idempotent so it can be applied to local databases in any state.

CREATE TABLE IF NOT EXISTS public.fx_rates (
  base_currency  text NOT NULL DEFAULT 'ZAR',
  quote_currency text NOT NULL,
  -- 1 quote_currency buys <rate> base_currency. USD/17.25000000 reads "1 USD = 17.25 ZAR".
  rate           numeric(18,8) NOT NULL CHECK (rate > 0),
  -- The rate's publication date at source (ECB publishes daily), not when we fetched it.
  as_of          date NOT NULL,
  source         text NOT NULL DEFAULT 'frankfurter' CHECK (source IN ('frankfurter', 'manual')),
  fetched_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (base_currency, quote_currency)
);

ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fx_rates TO authenticated;
GRANT ALL ON TABLE public.fx_rates TO service_role;

-- Read is open to every authenticated user: a salesperson has to see the rate to quote with it.
DROP POLICY IF EXISTS fx_rates_read ON public.fx_rates;
CREATE POLICY fx_rates_read
  ON public.fx_rates FOR SELECT
  TO authenticated
  USING (true);

-- Writes mirror app_settings: admin + manager only. A salesperson may override a rate for a
-- single quote (that lands in the quote's own snapshot), but not rewrite the shared cache.
DROP POLICY IF EXISTS fx_rates_manager_insert ON public.fx_rates;
CREATE POLICY fx_rates_manager_insert
  ON public.fx_rates FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.clearance_level IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS fx_rates_manager_update ON public.fx_rates;
CREATE POLICY fx_rates_manager_update
  ON public.fx_rates FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.clearance_level IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.clearance_level IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS fx_rates_manager_delete ON public.fx_rates;
CREATE POLICY fx_rates_manager_delete
  ON public.fx_rates FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.clearance_level IN ('admin', 'manager')
    )
  );

-- Seed placeholder rates so a fresh database can quote a foreign supplier before the first
-- live fetch. Deliberately dated in the past so the UI flags them as stale.
INSERT INTO public.fx_rates (base_currency, quote_currency, rate, as_of, source)
VALUES
  ('ZAR', 'USD', 17.25000000, '2026-01-01', 'manual'),
  ('ZAR', 'EUR', 18.90000000, '2026-01-01', 'manual'),
  ('ZAR', 'GBP', 22.10000000, '2026-01-01', 'manual')
ON CONFLICT (base_currency, quote_currency) DO NOTHING;
