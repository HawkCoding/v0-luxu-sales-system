CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_active_final_per_booking_idx
  ON public.invoices(booking_id)
  WHERE kind = 'final' AND status IN ('draft', 'sent');
