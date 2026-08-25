-- International vs resident rate audience, and a client-facing rate name distinct
-- from the internal one (e.g. code RVSADC / name "Rovos Rail SADC" but the client
-- email should read "on the SADC Resident special rate").
--
-- audience seeds quotes.rate_audience's Auto default (lib/quotes/quote-config.ts);
-- it is a starting position, not a lock -- the send-dialog toggle can override it
-- per quote. client_label feeds the {{rateLabel}} token, falling back to name.

ALTER TABLE public.rate_types
  ADD COLUMN IF NOT EXISTS audience text CHECK (audience IN ('international', 'resident')),
  ADD COLUMN IF NOT EXISTS client_label text;

UPDATE public.rate_types SET audience = 'international'
 WHERE code IN ('RAC', 'STO', 'NETT') AND audience IS NULL;

UPDATE public.rate_types SET audience = 'resident', client_label = 'Domestic special'
 WHERE code IN ('BTLD', 'BTHD') AND audience IS NULL;

UPDATE public.rate_types SET audience = 'resident', client_label = 'SADC Resident special'
 WHERE code IN ('RVSADC', 'KSSADC', 'KSSADCSTO') AND audience IS NULL;

NOTIFY pgrst, 'reload schema';
