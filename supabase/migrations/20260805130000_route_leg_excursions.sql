-- Voucher parity: the legacy voucher listed an excursion under the train leg (e.g. "Kimberley
-- **Weather & Time Permitted"). A route carries its typical excursions as a default; a leg can
-- override them for that specific booking.
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS default_excursions text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE public.booking_package_selections ADD COLUMN IF NOT EXISTS excursions text[];
ALTER TABLE public.booking_services ADD COLUMN IF NOT EXISTS excursions text[];

NOTIFY pgrst, 'reload schema';
