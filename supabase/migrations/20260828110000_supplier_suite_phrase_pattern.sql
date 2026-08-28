-- Per-supplier wording for the full suite phrase printed on client documents.
--
-- Every operator words the same selection differently: Blue Train reads "Twin bedded Deluxe
-- Suite with a shower", Rovos Rail reads "Double Crosswise Deluxe Suite". The default grammar
-- in lib/templates/suite-description.ts can only produce the first, so this column holds an
-- optional template deciding the order and which parts appear:
--
--   {type} {bedroom} {layout} {bathroom}   values; {type} carries the kind noun ("Deluxe Suite")
--   [ ... ]                                optional group, dropped whole when a token inside is empty
--
--   Rovos Rail   [{bedroom}] [{layout}] {type}
--   Blue Train   [{bedroom} bedded] {type} [with a {bathroom}]
--
-- NULL (the default) keeps today's grammar byte for byte. Applies wherever the full
-- configuration is stated -- voucher Suite Type row, invoice departure block, the
-- {{suiteDescription}} email token -- but NOT to the quote itinerary sentence, which states the
-- suite type alone unless quote_suite_detail is set to 'full'.

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS suite_phrase_pattern text;

COMMENT ON COLUMN public.suppliers.suite_phrase_pattern IS
  'Optional template for the full suite phrase, e.g. "[{bedroom}] [{layout}] {type}". NULL uses the default grammar in lib/templates/suite-description.ts.';

NOTIFY pgrst, 'reload schema';
