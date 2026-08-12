-- Fix: outcome_reasons manage policy gated on a JWT claim that is never set.
-- Writes (activate/deactivate/add) silently affected 0 rows for managers and admins.
-- Resolve the role via profiles, matching the rest of the schema.

DROP POLICY IF EXISTS "Managers can manage outcome_reasons" ON public.outcome_reasons;
CREATE POLICY "Managers can manage outcome_reasons"
  ON public.outcome_reasons FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.clearance_level IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.clearance_level IN ('admin', 'manager')
    )
  );
