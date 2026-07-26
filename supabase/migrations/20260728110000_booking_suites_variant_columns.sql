-- booking_suites previously only carried suite_type_id/suite_type_name -- the three config
-- axes (bedroom type, bedroom layout, bathroom type) had nowhere to land, so parsed values
-- were discarded on write. Add them, plus provenance of how the suite was resolved from the
-- raw enquiry wording, so the job page can render the same match badges without re-running
-- the resolver. All nullable, no backfill -- existing rows keep working unchanged.

ALTER TABLE public.booking_suites
  ADD COLUMN IF NOT EXISTS bedroom_type_id uuid REFERENCES public.bedroom_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bedroom_layout_id uuid REFERENCES public.bedroom_layouts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bathroom_type_id uuid REFERENCES public.bathroom_types(id) ON DELETE SET NULL,
  -- What the customer actually wrote, verbatim, and how the resolver got from there to ids
  -- (per-axis {source, score, candidates}).
  ADD COLUMN IF NOT EXISTS source_phrase text,
  ADD COLUMN IF NOT EXISTS match_json jsonb;

NOTIFY pgrst, 'reload schema';
