-- The "no package matched" banner is retired; the booking-services auto-build
-- resolvers now always produce services, so the flag never carried signal.

DROP INDEX IF EXISTS public.idx_quotes_no_package_match;

ALTER TABLE public.quotes
  DROP COLUMN IF EXISTS no_package_match;
