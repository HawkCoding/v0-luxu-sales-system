-- Supplier emails are an ordered list, not a set: the first row is the supplier's primary contact
-- and is mirrored onto suppliers.email. Without an ordering column the API discarded whatever order
-- the editor sent and read the rows back alphabetically by (label, email), so the primary contact
-- was decided by label spelling rather than by the user.

ALTER TABLE public.supplier_emails
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0 NOT NULL;

-- Backfill in the (label, email) order the loader used before this column existed, so nothing
-- visibly jumps the first time a supplier is opened. Skipped entirely once any row carries a
-- user-chosen position, which keeps a re-run of this migration from reshuffling real data.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.supplier_emails WHERE sort_order <> 0) THEN
    WITH ordered AS (
      SELECT
        id,
        row_number() OVER (PARTITION BY supplier_id ORDER BY label, email) - 1 AS position
      FROM public.supplier_emails
    )
    UPDATE public.supplier_emails AS target
    SET sort_order = ordered.position
    FROM ordered
    WHERE ordered.id = target.id;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
