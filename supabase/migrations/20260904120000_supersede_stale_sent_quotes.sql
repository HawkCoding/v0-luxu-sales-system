-- Close out quotes left at 'sent' under a booking that has already finished.
--
-- Two paths left them behind:
--   1. Crossing `accepted` only ever flipped the newest sent quote to 'accepted'; siblings
--      (older versions, or a second option the customer didn't take) stayed 'sent'.
--   2. Nothing cancels a booking's quotes when it is marked lost/cancelled.
--
-- The quote follow-up worker selects on `status = 'sent'`, so each of these rows was re-read and
-- re-skipped on every daily run, writing an error_logs row each time -- and, for a lost booking,
-- was at risk of actually emailing a customer who had already said no.
--
-- Idempotent: re-running matches nothing once the rows are superseded.

update public.quotes as q
set    status     = 'superseded',
       updated_at = now()
from   public.bookings as b
where  q.booking_id = b.id
  and  q.status = 'sent'
  and  (
         b.stage in (
           'deposit_requested',
           'payment_schedule',
           'deposit_paid',
           'final_paid',
           'voucher_sent',
           'trip_active',
           'closed',
           'lost'
         )
         or lower(coalesce(b.outcome, '')) in ('won', 'lost', 'cancelled')
       );
