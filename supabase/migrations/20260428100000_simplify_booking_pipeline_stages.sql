UPDATE public.bookings
SET stage = 'quote_sent'::public.pipeline_stage
WHERE stage::text = 'quoted';

UPDATE public.bookings
SET stage = 'accepted'::public.pipeline_stage
WHERE stage::text = 'form_done';

UPDATE public.bookings
SET stage = 'deposit_requested'::public.pipeline_stage
WHERE stage::text = 'payment_schedule';

UPDATE public.bookings
SET stage = 'voucher_sent'::public.pipeline_stage
WHERE stage::text = 'trip_active';
