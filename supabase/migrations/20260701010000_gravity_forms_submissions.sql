-- Raw intake table for the Gravity Forms webhook. Stores every payload
-- verbatim (shape varies across the ~5 enquiry forms) so nothing is lost
-- while field-to-column mapping is still being defined with the web dev.
-- `processed` flags rows once a later job maps them into customers/bookings.

CREATE TABLE IF NOT EXISTS public.gravity_forms_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  form_id text,
  payload jsonb NOT NULL,
  processed boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_gravity_forms_submissions_processed
  ON public.gravity_forms_submissions (processed)
  WHERE NOT processed;

ALTER TABLE public.gravity_forms_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gfs_select" ON public.gravity_forms_submissions;
CREATE POLICY "gfs_select" ON public.gravity_forms_submissions
  FOR SELECT TO authenticated
  USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));
