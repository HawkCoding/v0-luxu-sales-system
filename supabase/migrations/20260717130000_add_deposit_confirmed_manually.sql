-- Deposit Paid is confirmed by a manual tick, not by amount entry.
-- This flag makes the manual confirmation sticky so payment-amount
-- recalculation (sync-booking-payment-state) can no longer clear
-- deposit_paid once a salesperson has confirmed receipt.

alter table bookings
  add column if not exists deposit_confirmed_manually boolean not null default false;

-- Backfill: any booking already at or past deposit_paid was confirmed
-- under the old flow; preserve that so history does not regress.
update bookings
  set deposit_confirmed_manually = true
  where deposit_paid = true
     or stage in ('deposit_paid', 'final_paid', 'voucher_sent', 'closed');
