-- Rovos-style journey-length and train-only wording, per supplier.
--
-- long_journey_min_days: a train_operator's threshold for "long journey" inclusions
-- (Rovos = 9, i.e. routes.duration_days >= 9). NULL means this supplier has no
-- short/long concept at all (Blue Train) -- quotes.journey_class then always
-- resolves to NULL rather than guessing.
--
-- train_only_note: the {{trainOnlyNote}} block token body, shown only when every
-- priced leg on the quote is a train_operator leg (see lib/quotes/quote-config.ts).

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS long_journey_min_days integer,
  ADD COLUMN IF NOT EXISTS train_only_note text;

NOTIFY pgrst, 'reload schema';
