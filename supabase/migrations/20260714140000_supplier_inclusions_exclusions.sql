-- Client-facing bullet lists per supplier.
--
-- `inclusions` render as bullets under that supplier's leg in the quote itinerary
-- ("Your Package Includes"); `exclusions` are pooled across every leg on the quote
-- into the "Your Package Excludes" section. Both are ordered lists of short phrases,
-- e.g. The Blue Train: {'High Tea', '24-hour Butler service', 'Wi-Fi'}.

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS inclusions text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS exclusions text[] NOT NULL DEFAULT '{}';

-- The excludes section wording, alongside the existing quote_doc_* document-text keys.
INSERT INTO public.app_settings (key, value)
VALUES
  ('quote_doc_excludes_heading', 'Your Package Excludes'),
  ('quote_doc_excludes_default', 'Services not mentioned.')
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
