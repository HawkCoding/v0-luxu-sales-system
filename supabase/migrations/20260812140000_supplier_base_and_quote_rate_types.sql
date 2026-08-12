-- Split the supplier's single "default rate type" into two distinct concepts.
--
-- suppliers.default_rate_type_id used to mean two things at once:
--   1. the baseline that supplier_rate_adjustments.discount_pct is measured
--      against (and that the rate-matrix markdown generator reads from), and
--   2. the rate a quote line actually prices at.
--
-- Setting the baseline so the markdown maths worked silently changed what
-- quotes priced at. This migration separates them:
--
--   base_rate_type_id  -- this supplier's own starting price; all % markdowns
--                         are measured off it. Written down explicitly for
--                         every supplier by the backfill below.
--   quote_rate_type_id -- the rate quotes use for this supplier. NULL means
--                         "use the base rate", which is exactly the behaviour
--                         before this migration, so the change is price-neutral.
--
-- The per-supplier-kind mapping and the per-customer default are both removed:
-- the supplier is now the only place a quote's rate comes from.

-- 1. Backfill the baseline before the kind mapping disappears, so no supplier
--    silently reprices. Precedence preserved: own override -> kind default ->
--    global default.
UPDATE public.suppliers s
   SET default_rate_type_id = COALESCE(
         -- suppliers.kind is the supplier_kind enum; the mapping table keyed it as text.
         (SELECT k.rate_type_id
            FROM public.supplier_kind_default_rate_types k
           WHERE k.kind = s.kind::text),
         (SELECT rt.id
            FROM public.rate_types rt
           WHERE rt.is_default AND rt.archived_at IS NULL
           ORDER BY rt.sort_order
           LIMIT 1)
       )
 WHERE s.default_rate_type_id IS NULL;

-- 2. Rename to say which of the two meanings the column carries.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'suppliers'
       AND column_name = 'default_rate_type_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'suppliers'
       AND column_name = 'base_rate_type_id'
  ) THEN
    ALTER TABLE public.suppliers RENAME COLUMN default_rate_type_id TO base_rate_type_id;
  END IF;
END $$;

ALTER INDEX IF EXISTS idx_suppliers_default_rate_type RENAME TO idx_suppliers_base_rate_type;

-- Renaming a column leaves its FK constraint under the old name, which shows up
-- in generated types and in PostgREST embed hints.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'suppliers_default_rate_type_id_fkey'
       AND conrelid = 'public.suppliers'::regclass
  ) THEN
    ALTER TABLE public.suppliers
      RENAME CONSTRAINT suppliers_default_rate_type_id_fkey TO suppliers_base_rate_type_id_fkey;
  END IF;
END $$;

-- 3. The new, explicit "what do we quote this supplier at" choice.
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS quote_rate_type_id uuid REFERENCES public.rate_types(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.suppliers.base_rate_type_id IS
  'This supplier''s baseline rate type. All supplier_rate_adjustments.discount_pct values are measured off it.';
COMMENT ON COLUMN public.suppliers.quote_rate_type_id IS
  'The rate type quotes price this supplier at. NULL means use base_rate_type_id.';

CREATE INDEX IF NOT EXISTS idx_suppliers_quote_rate_type
  ON public.suppliers (quote_rate_type_id)
  WHERE quote_rate_type_id IS NOT NULL;

-- 4. The per-kind mapping is replaced by the per-supplier base rate above.
DROP TABLE IF EXISTS public.supplier_kind_default_rate_types;

-- 5. The per-customer default is removed: it could silently override the
--    supplier's quoted rate, which is the collision this change exists to end.
DROP INDEX IF EXISTS public.idx_customers_default_rate_type;
ALTER TABLE public.customers
  DROP COLUMN IF EXISTS default_rate_type_id;

-- 6. Archiving a rate type already purges dependent supplier_rate_adjustments
--    (20260630000000). It must now also clear any supplier that quotes at it,
--    so a starred rate cannot survive its own archival.
CREATE OR REPLACE FUNCTION public.purge_rate_adjustments_on_archive()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL THEN
    DELETE FROM public.supplier_rate_adjustments
    WHERE rate_type_id = NEW.id;

    UPDATE public.suppliers
       SET quote_rate_type_id = NULL
     WHERE quote_rate_type_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purge_rate_adjustments_on_archive ON public.rate_types;
CREATE TRIGGER trg_purge_rate_adjustments_on_archive
  BEFORE UPDATE ON public.rate_types
  FOR EACH ROW
  EXECUTE FUNCTION public.purge_rate_adjustments_on_archive();
