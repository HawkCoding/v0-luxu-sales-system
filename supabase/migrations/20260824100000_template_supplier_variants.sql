-- Per-train template variants: a system template key (e.g. "quote_email") can now
-- have one row per train_operator supplier plus one untagged fallback row.
-- Resolution order lives in code (lib/templates/get-template.ts): explicit
-- quotes.template_id override -> (key, primaryTrainSupplierId) -> (key, NULL).

ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS public.templates_key_unique;
CREATE UNIQUE INDEX IF NOT EXISTS ux_templates_key_supplier
  ON public.templates (key, supplier_id) NULLS NOT DISTINCT;

NOTIFY pgrst, 'reload schema';
