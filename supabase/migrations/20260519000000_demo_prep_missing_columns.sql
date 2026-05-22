-- ---------------------------------------------------------------
-- Demo-prep catch-up: add columns that the seed and app code
-- expect but that are missing from the current local schema.
-- All adds are IF NOT EXISTS so the migration is idempotent.
-- ---------------------------------------------------------------

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS vip_status boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preferences text,
  ADD COLUMN IF NOT EXISTS communication_preferences text,
  ADD COLUMN IF NOT EXISTS is_repeat_client boolean NOT NULL DEFAULT false;

ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS markup_pct numeric(5,2) NOT NULL DEFAULT 0;

-- Demo-only inbound email account so /api/dev/replay-inbound-email works.
-- Only inserts if the table exists (it ships in 20260428143000_inbound_email_intake.sql).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='inbound_email_accounts') THEN
    INSERT INTO public.inbound_email_accounts (
      id, email, host, port, tls_mode, username, password_encrypted,
      inbox_folder, processed_folder, needs_review_folder, enabled
    ) VALUES (
      '00000000-0000-0000-0000-00000000ea01',
      'enquiries@luxustravel.co.za',
      'imap.demo.local', 993, 'ssl_tls',
      'enquiries@luxustravel.co.za', 'demo-no-real-credentials',
      'INBOX', 'Processed', 'Needs Review', false
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- quote_status: ensure 'expired' and 'cancelled' values exist (used in seed)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e
                 JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'quote_status' AND e.enumlabel = 'expired') THEN
    ALTER TYPE public.quote_status ADD VALUE 'expired';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e
                 JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'quote_status' AND e.enumlabel = 'cancelled') THEN
    ALTER TYPE public.quote_status ADD VALUE 'cancelled';
  END IF;
END $$;
