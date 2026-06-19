-- Phase 34: Email template add/remove.
-- Adds an `is_system` flag so the built-in pipeline templates (quote, follow-up,
-- deposit request, voucher) can be edited but never deleted, while custom
-- templates added by admins/managers can be created and removed freely.
-- A unique index on `key` keeps generated keys collision-free.

alter table public.templates
  add column if not exists is_system boolean not null default false;

create unique index if not exists templates_key_unique on public.templates (key);

-- Mark the built-in send-flow templates as system (protected from deletion).
update public.templates
  set is_system = true
  where key in ('quote_email', 'follow_up', 'deposit_request', 'voucher_email');
