-- Purge orphaned supplier rate adjustments and guard against recurrence.
--
-- An adjustment that references an archived rate type is invisible in the
-- supplier editor (the UI filters to active rate types) yet is still submitted
-- on every save, so the server rejects the whole save with
-- "Each rate adjustment must reference an active rate type." (400). The manager
-- has no UI lever to clear it.
--
-- The rate-type archive endpoint blocks archiving while rate *cards* reference
-- the type but never checks *adjustments*, so a type with adjustments and no
-- cards archives freely and strands the adjustment.
--
-- Part A purges the existing orphans. Part B installs a trigger so archiving a
-- rate type auto-deletes its dependent adjustments in the same transaction —
-- closing the door regardless of which code path performs the archive.

-- Part A — purge existing orphaned adjustments.
DELETE FROM public.supplier_rate_adjustments sra
USING public.rate_types rt
WHERE rt.id = sra.rate_type_id
  AND rt.archived_at IS NOT NULL;

-- Part B — permanent guard.
CREATE OR REPLACE FUNCTION public.purge_rate_adjustments_on_archive()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL THEN
    DELETE FROM public.supplier_rate_adjustments
    WHERE rate_type_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purge_rate_adjustments_on_archive ON public.rate_types;
CREATE TRIGGER trg_purge_rate_adjustments_on_archive
  BEFORE UPDATE ON public.rate_types
  FOR EACH ROW
  EXECUTE FUNCTION public.purge_rate_adjustments_on_archive();
