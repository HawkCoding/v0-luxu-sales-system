-- Payment schema completion: invoice linkage, captured_by, payment_kind, reminders

-- payments: link payment to a specific invoice (optional, for reference)
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL;

-- payments: record which staff member captured the payment (profiles PK is user_id)
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS captured_by uuid REFERENCES profiles(user_id) ON DELETE SET NULL;

-- payments: distinguish captures from refunds (negative-amount refund payments)
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_kind text NOT NULL DEFAULT 'capture'
    CONSTRAINT payments_payment_kind_check CHECK (payment_kind IN ('capture', 'refund'));

-- Backfill: existing negative-amount payments are refunds
UPDATE payments SET payment_kind = 'refund' WHERE amount < 0;

-- payment_reminders: track which overdue-invoice reminder emails have been sent
CREATE TABLE IF NOT EXISTS payment_reminders (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  scheduled_for date      NOT NULL,
  sent_at     timestamptz,
  status      text        NOT NULL DEFAULT 'pending'
                CONSTRAINT payment_reminders_status_check CHECK (status IN ('pending', 'sent', 'failed')),
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payment_reminders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payment_reminders'
    AND policyname = 'authenticated can select payment_reminders'
  ) THEN
    CREATE POLICY "authenticated can select payment_reminders"
      ON payment_reminders FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payment_reminders'
    AND policyname = 'authenticated can insert payment_reminders'
  ) THEN
    CREATE POLICY "authenticated can insert payment_reminders"
      ON payment_reminders FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payment_reminders'
    AND policyname = 'authenticated can update payment_reminders'
  ) THEN
    CREATE POLICY "authenticated can update payment_reminders"
      ON payment_reminders FOR UPDATE
      TO authenticated
      USING (true);
  END IF;
END $$;

-- Settings: payment reminder configuration
-- NOTE: invoice overdue is computed at query time (CURRENT_DATE cannot be used
-- in a Postgres GENERATED ALWAYS AS column because it is not IMMUTABLE).
INSERT INTO app_settings (key, value)
VALUES
  ('payment_reminder_enabled', 'true'),
  ('payment_reminder_cadence', '[3,7,14]')
ON CONFLICT (key) DO NOTHING;
