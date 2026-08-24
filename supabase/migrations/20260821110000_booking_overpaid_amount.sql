-- Overpayments used to vanish: invoice_balance clamps at zero, so paying more
-- than the quote total looked identical to paying it exactly. Keep the clamp,
-- but record the excess alongside it so it can be surfaced and reconciled.
alter table public.bookings
  add column if not exists overpaid_amount numeric(12,2) not null default 0;

notify pgrst, 'reload schema';
