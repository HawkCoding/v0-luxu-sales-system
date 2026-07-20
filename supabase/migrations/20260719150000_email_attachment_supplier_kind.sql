-- Add a supplier-category scope tier to the email attachment library. A file
-- can now target: every booking (supplier_id + supplier_kind both NULL), one
-- supplier category (supplier_kind set, e.g. 'train_operator'), or one specific
-- supplier (supplier_id set) — the two scoping columns are mutually exclusive.
-- Idempotent — safe to run on existing databases.

ALTER TABLE public.email_attachment_library
  ADD COLUMN IF NOT EXISTS supplier_kind text;

-- Restrict supplier_kind to the SupplierKind enum values (mirrors lib/types.ts).
ALTER TABLE public.email_attachment_library
  DROP CONSTRAINT IF EXISTS email_attachment_library_supplier_kind_check;
ALTER TABLE public.email_attachment_library
  ADD CONSTRAINT email_attachment_library_supplier_kind_check
  CHECK (
    supplier_kind IS NULL OR supplier_kind IN (
      'train_operator',
      'hotel_property',
      'transfers',
      'vehicle_rental',
      'tour_operator',
      'airline'
    )
  );

-- A file is scoped to a specific supplier OR a category, never both.
ALTER TABLE public.email_attachment_library
  DROP CONSTRAINT IF EXISTS email_attachment_library_scope_exclusive_check;
ALTER TABLE public.email_attachment_library
  ADD CONSTRAINT email_attachment_library_scope_exclusive_check
  CHECK (supplier_id IS NULL OR supplier_kind IS NULL);

CREATE INDEX IF NOT EXISTS email_attachment_library_supplier_kind_idx
  ON public.email_attachment_library(supplier_kind);
