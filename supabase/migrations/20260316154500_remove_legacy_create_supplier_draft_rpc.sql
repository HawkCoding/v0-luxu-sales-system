-- Remove legacy draft RPC that only exists in one environment.
-- Keeping this out of both projects avoids privilege drift and schema mismatch.

drop function if exists public.create_supplier_draft(
  text,
  text,
  text,
  text,
  text,
  text,
  text
);

notify pgrst, 'reload schema';
