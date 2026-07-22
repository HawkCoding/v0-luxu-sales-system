-- The standalone "itinerary email" send was removed — the itinerary PDF is
-- now generated silently and only ever attached to the voucher email, never
-- sent on its own. Drop the now-unused system template row.
DELETE FROM public.templates WHERE key = 'itinerary_email';
