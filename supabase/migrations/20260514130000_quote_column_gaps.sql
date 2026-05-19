-- Phase 17/18 gap fill: missing columns on quotes, quote_line_items, correspondences
-- All statements are idempotent via ADD COLUMN IF NOT EXISTS.

-- quotes: schema gaps
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS title text DEFAULT 'PROVISIONAL QUOTATION';
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS amount_received numeric DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS pdf_document_id uuid REFERENCES documents(id);

-- outstanding_amount as a stored generated column so it stays in sync automatically
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'quotes'
      AND column_name  = 'outstanding_amount'
  ) THEN
    ALTER TABLE quotes
      ADD COLUMN outstanding_amount numeric
        GENERATED ALWAYS AS (total - COALESCE(amount_received, 0)) STORED;
  END IF;
END;
$$;

-- quote_line_items: status lifecycle tracking
ALTER TABLE quote_line_items ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

-- correspondences: recipient addresses
ALTER TABLE correspondences ADD COLUMN IF NOT EXISTS recipients text[];
