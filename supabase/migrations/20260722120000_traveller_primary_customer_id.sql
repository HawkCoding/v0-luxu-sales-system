-- Lets a salesperson pull the customer into the guest list as the primary
-- guest, and gives customers an ID/passport field (previously only
-- travellers had one) so it can be corrected from that guest row.

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS id_passport text;

ALTER TABLE public.travellers ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS ux_travellers_one_primary_per_booking
  ON public.travellers (booking_id) WHERE is_primary;

NOTIFY pgrst, 'reload schema';
