-- v2 of the booking worksheet ("place of record" PDF): the two columns the
-- paper worksheet's pax grid needs that travellers doesn't carry yet, and the
-- per-supplier-line financial columns (dates, paid-with, cost/receivable) the
-- worksheet's service-lines table needs. Both tables already have RLS,
-- set_updated_at triggers, and grants from earlier migrations.

ALTER TABLE public.travellers
  ADD COLUMN IF NOT EXISTS room_with text,
  ADD COLUMN IF NOT EXISTS room_type text;

ALTER TABLE public.booking_supplier_schedules
  ADD COLUMN IF NOT EXISTS booking_date date,
  ADD COLUMN IF NOT EXISTS confirmation_date date,
  ADD COLUMN IF NOT EXISTS payment_made_date date,
  ADD COLUMN IF NOT EXISTS paid_with text,
  ADD COLUMN IF NOT EXISTS amount_payable numeric,
  ADD COLUMN IF NOT EXISTS amount_receivable numeric;

NOTIFY pgrst, 'reload schema';
