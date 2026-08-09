-- Suppliers can nominate their own default rate type, so two suppliers of the
-- same kind (e.g. two train operators) can each have their own baseline rather
-- than sharing the one mapped to their kind. Nullable: when unset, the supplier
-- inherits the per-kind default, then the system default.
--
-- This is the baseline that supplier_rate_adjustments.discount_pct is measured
-- against, and the tier that sits between the customer default and the system
-- default when a quote line resolves its rate card.

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS default_rate_type_id uuid REFERENCES public.rate_types(id);

CREATE INDEX IF NOT EXISTS idx_suppliers_default_rate_type
  ON public.suppliers (default_rate_type_id)
  WHERE default_rate_type_id IS NOT NULL;
