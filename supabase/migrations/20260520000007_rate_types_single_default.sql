-- Enforce at most one active default rate_type at the DB level.
-- Eliminates the race condition where two concurrent "set as default" PATCH
-- requests could both clear the others and both set themselves, leaving the
-- table with two active defaults.
CREATE UNIQUE INDEX IF NOT EXISTS rate_types_single_default_idx
  ON public.rate_types (is_default)
  WHERE is_default = true AND archived_at IS NULL;
