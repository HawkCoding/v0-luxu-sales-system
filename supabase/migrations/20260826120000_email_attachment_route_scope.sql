-- Narrow the email attachment library one tier further: a supplier-scoped file
-- can be pinned to a single one of that supplier's routes, so an operator with
-- several journeys can carry a different fact sheet per journey.
-- route_id is a refinement of supplier_id, never a scope on its own — deleting
-- the route degrades the file back to supplier scope rather than making it
-- apply to every booking.
-- Idempotent — safe to run on existing databases.

ALTER TABLE public.email_attachment_library
  ADD COLUMN IF NOT EXISTS route_id uuid REFERENCES public.routes(id) ON DELETE SET NULL;

ALTER TABLE public.email_attachment_library
  DROP CONSTRAINT IF EXISTS email_attachment_library_route_scope_check;
ALTER TABLE public.email_attachment_library
  ADD CONSTRAINT email_attachment_library_route_scope_check
  CHECK (route_id IS NULL OR (supplier_id IS NOT NULL AND supplier_kind IS NULL));

CREATE INDEX IF NOT EXISTS email_attachment_library_route_idx
  ON public.email_attachment_library(route_id);
