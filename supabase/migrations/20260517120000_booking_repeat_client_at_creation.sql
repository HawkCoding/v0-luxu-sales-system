ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS is_repeat_client_at_creation boolean NOT NULL DEFAULT false;

UPDATE public.bookings AS booking
SET is_repeat_client_at_creation = true
WHERE is_repeat_client_at_creation = false
  AND customer_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.bookings AS prior_booking
    WHERE prior_booking.customer_id = booking.customer_id
      AND prior_booking.id <> booking.id
      AND prior_booking.stage IN ('voucher_sent', 'trip_active', 'closed')
      AND prior_booking.created_at < booking.created_at
  );

COMMENT ON COLUMN public.bookings.is_repeat_client_at_creation IS
  'True when the customer already had a voucher-sent, legacy trip-active, or closed booking before this booking was created.';
