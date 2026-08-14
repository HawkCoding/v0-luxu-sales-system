-- QA 10 / F10-7: a non-optional leg (train_operator) is priced into the quote whether or not it is
-- ticked, so `selected = false` only ever removed it from the voucher -- a voucher missing the
-- journey the customer was charged for. The API now refuses to unselect one; this repairs any row
-- that was already left that way. Idempotent: re-running matches nothing.
UPDATE public.booking_services AS bs
SET selected = TRUE
FROM public.suppliers AS s
WHERE s.id = bs.supplier_id
  AND s.kind = 'train_operator'
  AND bs.selected = FALSE;
