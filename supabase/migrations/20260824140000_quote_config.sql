-- Per-quote email/PDF configuration: journey length, rate audience, the train-only
-- note, and a template variant override. All four are nullable and NULL means
-- "follow Auto" -- the derived value from lib/quotes/quote-config.ts is never
-- written back here, so a later correction (e.g. filling in a route's
-- duration_days) still takes effect on an existing quote.

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS journey_class text CHECK (journey_class IN ('short', 'long')),
  ADD COLUMN IF NOT EXISTS rate_audience text CHECK (rate_audience IN ('international', 'resident')),
  ADD COLUMN IF NOT EXISTS show_train_only_note boolean,
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.templates(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
