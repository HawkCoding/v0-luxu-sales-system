-- Club / loyalty member numbers (frequent flyer, rail clubs, ...), kept for record only.
-- Each entry is {"club": text, "number": text}. Captured per guest on a booking; the
-- primary guest's entries are merged onto the customer record.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS club_memberships jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.travellers
  ADD COLUMN IF NOT EXISTS club_memberships jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_club_memberships_is_array;
ALTER TABLE public.customers
  ADD CONSTRAINT customers_club_memberships_is_array CHECK (jsonb_typeof(club_memberships) = 'array');

ALTER TABLE public.travellers DROP CONSTRAINT IF EXISTS travellers_club_memberships_is_array;
ALTER TABLE public.travellers
  ADD CONSTRAINT travellers_club_memberships_is_array CHECK (jsonb_typeof(club_memberships) = 'array');
