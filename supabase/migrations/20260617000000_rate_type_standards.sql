-- §1 Rate-type standards: Rack Rate (RAC) and Standard Tour Operator (STO) are
-- permanent, system-protected rate types. They can be renamed but never
-- archived or deleted, and must always exist.

ALTER TABLE public.rate_types
  ADD COLUMN IF NOT EXISTS is_standard boolean NOT NULL DEFAULT false;

-- Ensure the two standards exist (idempotent) before flagging them.
INSERT INTO public.rate_types (code, name, sort_order, is_default, is_standard) VALUES
  ('RAC', 'Rack Rate',              0, true,  true),
  ('STO', 'Standard Tour Operator', 1, false, true)
ON CONFLICT (code) DO NOTHING;

UPDATE public.rate_types
   SET is_standard = true
 WHERE code IN ('RAC', 'STO');
