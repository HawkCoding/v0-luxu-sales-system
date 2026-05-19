-- Records Phase 34 business defaults in the existing key/value settings table.
-- These rows are intentionally minimal so later implementation prompts can wire
-- behavior to the same canonical settings without changing the chosen defaults.

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.app_settings (key, value, updated_at)
VALUES
  ('quote_validity_days', '14', now()),
  ('deposit_due_rule', 'after_quote_acceptance', now()),
  ('deposit_due_days', '7', now()),
  ('final_payment_due_days_before_departure', '30', now()),
  ('outbound_email_provider', 'tbd_provider_not_selected', now()),
  ('backup_storage_provider', 'supabase_storage', now()),
  ('backup_storage_bucket', 'backups', now()),
  ('read_only_exports_allowed', 'false', now()),
  ('payment_reference_required', 'false', now()),
  ('quote_acceptance_after_expiry', 'blocked', now())
ON CONFLICT (key) DO NOTHING;
