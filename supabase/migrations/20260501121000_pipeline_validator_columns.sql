alter table public.bookings
  add column if not exists quote_sent_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists deposit_requested_at timestamptz,
  add column if not exists deposit_paid_at timestamptz,
  add column if not exists final_paid_at timestamptz,
  add column if not exists voucher_sent_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists deposit_paid boolean not null default false,
  add column if not exists invoice_balance numeric(12,2),
  add column if not exists refund_status text check (refund_status in ('refunded','not_refunded')),
  add column if not exists refund_amount numeric(12,2),
  add column if not exists refund_reference text,
  add column if not exists refunded_at timestamptz;

alter table public.audit_logs
  add column if not exists override_reason text,
  add column if not exists overridden_by uuid references auth.users(id);

alter table public.correspondences
  add column if not exists kind text;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'document_status'
      and e.enumlabel = 'sent'
  ) then
    alter type public.document_status add value 'sent';
  end if;
end $$;

create index if not exists idx_correspondences_booking_kind
  on public.correspondences (booking_id, kind);

notify pgrst, 'reload schema';
