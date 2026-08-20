-- The supplier-admin dates (when the booking was placed with the supplier, when it was
-- confirmed, when it was paid and how) move off booking_supplier_schedules -- a per-supplier
-- side table with no link to the leg it described -- onto the service row itself, so the
-- worksheet reads them per leg instead of "first schedule row per supplier wins".
--
-- booking_supplier_schedules stays in place for now (its route and UI are being retired in the
-- same release, but the table itself is kept one release longer as a safety net for this
-- backfill -- see the DROP TABLE follow-up migration once that has proven out).

ALTER TABLE public.booking_services
  ADD COLUMN IF NOT EXISTS booking_date date,
  ADD COLUMN IF NOT EXISTS confirmation_date date,
  ADD COLUMN IF NOT EXISTS payment_made_date date,
  ADD COLUMN IF NOT EXISTS paid_with text;

-- Backfill from the old table, matched on (booking_id, supplier_id). The worksheet's old rule
-- was "first schedule row per supplier wins" (lib/worksheet/service-lines.ts, scheduleBySupplier)
-- -- DISTINCT ON with the same ordering reproduces exactly what the worksheet was already
-- printing. Only fills columns that are still NULL, so re-running this migration never clobbers
-- a value already typed against the new columns.
WITH first_schedule AS (
  SELECT DISTINCT ON (booking_id, supplier_id)
         booking_id, supplier_id, booking_date, confirmation_date, payment_made_date, paid_with
  FROM public.booking_supplier_schedules
  WHERE supplier_id IS NOT NULL
  ORDER BY booking_id, supplier_id, sort_order, created_at
)
UPDATE public.booking_services AS bs
SET booking_date      = COALESCE(bs.booking_date,      fs.booking_date),
    confirmation_date = COALESCE(bs.confirmation_date, fs.confirmation_date),
    payment_made_date = COALESCE(bs.payment_made_date, fs.payment_made_date),
    paid_with         = COALESCE(bs.paid_with,         fs.paid_with)
FROM first_schedule AS fs
WHERE bs.booking_id = fs.booking_id
  AND bs.supplier_id = fs.supplier_id
  AND (bs.booking_date IS NULL OR bs.confirmation_date IS NULL
       OR bs.payment_made_date IS NULL OR bs.paid_with IS NULL);

NOTIFY pgrst, 'reload schema';
