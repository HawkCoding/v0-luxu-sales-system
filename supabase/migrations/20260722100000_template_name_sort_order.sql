-- Display name (cosmetic only — `key` stays the durable identifier used by
-- every trigger/lookup) and sort_order for drag-drop reordering in the
-- Templates settings page.
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Backfill canonical seed order for the 7 system templates (matches insert
-- order in 20260712100000_unify_email_templates.sql).
UPDATE public.templates SET sort_order = CASE key
  WHEN 'quote_email' THEN 0
  WHEN 'follow_up' THEN 1
  WHEN 'deposit_request' THEN 2
  WHEN 'voucher_email' THEN 3
  WHEN 'final_invoice' THEN 4
  WHEN 'payment_reminder' THEN 5
  WHEN 'thank_you' THEN 6
  ELSE sort_order
END
WHERE key IN ('quote_email','follow_up','deposit_request','voucher_email',
              'final_invoice','payment_reminder','thank_you');

-- Any other (custom) templates get ordered after the system 7, by creation date.
UPDATE public.templates t SET sort_order = sub.rn FROM (
  SELECT id, 6 + ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM public.templates
  WHERE key NOT IN ('quote_email','follow_up','deposit_request','voucher_email',
                     'final_invoice','payment_reminder','thank_you')
) sub WHERE t.id = sub.id;
