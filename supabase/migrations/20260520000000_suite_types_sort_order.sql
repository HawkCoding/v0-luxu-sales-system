-- Phase 1: suite_types sort order
ALTER TABLE public.suite_types
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS suite_types_supplier_sort_idx
  ON public.suite_types (supplier_id, sort_order);
