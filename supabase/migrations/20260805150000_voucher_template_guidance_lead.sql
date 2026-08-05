-- Voucher parity: the legacy voucher led with "Please hand to your service provider." on its own
-- line before the pre-payment paragraph. Split out so the template can print both lines without
-- baking the lead sentence into the editable guidance_text.
ALTER TABLE public.voucher_template
  ADD COLUMN IF NOT EXISTS guidance_lead_text text NOT NULL DEFAULT 'Please hand to your service provider.';

NOTIFY pgrst, 'reload schema';
