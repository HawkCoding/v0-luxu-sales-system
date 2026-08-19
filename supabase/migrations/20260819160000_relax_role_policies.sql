-- Relax RLS write policies so consultants have the same reference-data and
-- operational access as admin/manager, matching the app-layer permission
-- matrix (lib/role-context.tsx) and API route sweep landing in this branch.
-- Two gates remain narrower than "any active role": user management
-- (profiles_update_own stays admin-only) and settings writes (app_settings,
-- rate_types, voucher_template, inbound_email_*, backup_records,
-- outcome_reasons, email_attachment_library, signature_brands, fx_rates,
-- salesperson_credentials, email_signatures — all unchanged, still
-- admin+manager).

DO $$
DECLARE
  t text;
BEGIN
  -- Supplier / catalogue reference tables: ref_insert + ref_update widen to
  -- admin+manager+consultant. ref_delete already includes manager (see
  -- 20260319100000_allow_manager_ref_deletes.sql) and now also gets consultant.
  FOR t IN SELECT unnest(ARRAY[
    'suppliers', 'locations', 'hotel_offers', 'routes', 'suite_types', 'rate_cards',
    'supplier_pricing_options', 'supplier_seasonal_periods', 'supplier_seasonal_prices',
    'supplier_emails', 'supplier_email_labels', 'supplier_station_addresses',
    'countries', 'country_aliases', 'vehicle_rental_route_details',
    'bedroom_types', 'bedroom_layouts', 'bathroom_types', 'templates'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS ref_insert ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY ref_insert ON public.%I FOR INSERT TO authenticated
         WITH CHECK (public.auth_has_role(ARRAY[''admin''::public.user_role, ''manager''::public.user_role, ''consultant''::public.user_role]))',
      t
    );

    EXECUTE format('DROP POLICY IF EXISTS ref_update ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY ref_update ON public.%I FOR UPDATE TO authenticated
         USING (public.auth_has_role(ARRAY[''admin''::public.user_role, ''manager''::public.user_role, ''consultant''::public.user_role]))
         WITH CHECK (public.auth_has_role(ARRAY[''admin''::public.user_role, ''manager''::public.user_role, ''consultant''::public.user_role]))',
      t
    );

    EXECUTE format('DROP POLICY IF EXISTS ref_delete ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY ref_delete ON public.%I FOR DELETE TO authenticated
         USING (public.auth_has_role(ARRAY[''admin''::public.user_role, ''manager''::public.user_role, ''consultant''::public.user_role]))',
      t
    );
  END LOOP;

  -- Suite-variant join tables use a single FOR ALL "ref_write" policy.
  FOR t IN SELECT unnest(ARRAY[
    'suite_type_bedroom_types', 'suite_type_bedroom_layouts', 'suite_type_bathroom_types'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS ref_write ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY ref_write ON public.%I FOR ALL TO authenticated
         USING (public.auth_has_role(ARRAY[''admin''::public.user_role, ''manager''::public.user_role, ''consultant''::public.user_role]))
         WITH CHECK (public.auth_has_role(ARRAY[''admin''::public.user_role, ''manager''::public.user_role, ''consultant''::public.user_role]))',
      t
    );
  END LOOP;

  -- suite_vocab_aliases: only ref_delete is role-gated (insert/update are open).
  DROP POLICY IF EXISTS ref_delete ON public.suite_vocab_aliases;
  CREATE POLICY ref_delete ON public.suite_vocab_aliases
    FOR DELETE TO authenticated
    USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role, 'consultant'::public.user_role]));

  -- report_snapshots
  DROP POLICY IF EXISTS rs_insert ON public.report_snapshots;
  CREATE POLICY rs_insert ON public.report_snapshots
    FOR INSERT TO authenticated
    WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role, 'consultant'::public.user_role]));

  DROP POLICY IF EXISTS rs_update ON public.report_snapshots;
  CREATE POLICY rs_update ON public.report_snapshots
    FOR UPDATE TO authenticated
    USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role, 'consultant'::public.user_role]))
    WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role, 'consultant'::public.user_role]));

  -- booking_notes: any active role may edit/delete another author's note now
  -- that "manage:notes" is open to all three roles.
  DROP POLICY IF EXISTS booking_notes_update ON public.booking_notes;
  CREATE POLICY booking_notes_update ON public.booking_notes
    FOR UPDATE TO authenticated
    USING (true);

  DROP POLICY IF EXISTS booking_notes_delete ON public.booking_notes;
  CREATE POLICY booking_notes_delete ON public.booking_notes
    FOR DELETE TO authenticated
    USING (true);

  -- error_logs: resolving an error is open to all three roles now.
  DROP POLICY IF EXISTS error_logs_update_manager ON public.error_logs;
  CREATE POLICY error_logs_update_manager ON public.error_logs
    FOR UPDATE TO authenticated
    USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role, 'consultant'::public.user_role]))
    WITH CHECK (
      resolved = true
      AND public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role, 'consultant'::public.user_role])
    );

  -- audit_log_archives: reading the audit log is open to all three roles now.
  DROP POLICY IF EXISTS audit_log_archives_select ON public.audit_log_archives;
  CREATE POLICY audit_log_archives_select ON public.audit_log_archives
    FOR SELECT TO authenticated
    USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role, 'consultant'::public.user_role]));

  -- gravity_forms_submissions: same view surfaces on /app/enquiries for all roles.
  DROP POLICY IF EXISTS gfs_select ON public.gravity_forms_submissions;
  CREATE POLICY gfs_select ON public.gravity_forms_submissions
    FOR SELECT TO authenticated
    USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role, 'consultant'::public.user_role]));

  -- profiles: any active role can read the full profile list now (the
  -- reassign-salesperson picker and assignable-users API need this for
  -- consultants, not just admin/manager). profiles_update_own is untouched --
  -- that is the user-management gate and stays admin-only.
  DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
  CREATE POLICY profiles_select_own ON public.profiles
    FOR SELECT TO authenticated
    USING (true);

  -- Self-service exception: PATCH /api/settings/salesperson-credentials/[id]
  -- now lets a consultant edit their own row (app/api/settings/salesperson-
  -- credentials/[id]/route.ts). The API check needs a matching RLS grant or
  -- the update 500s instead of 403ing cleanly.
  DROP POLICY IF EXISTS salesperson_credentials_consultant_update_own ON public.salesperson_credentials;
  CREATE POLICY salesperson_credentials_consultant_update_own ON public.salesperson_credentials
    FOR UPDATE TO authenticated
    USING (
      profile_id IN (SELECT user_id FROM public.profiles WHERE profiles.user_id = auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.user_id = auth.uid() AND profiles.clearance_level = 'consultant'
      )
    )
    WITH CHECK (
      profile_id IN (SELECT user_id FROM public.profiles WHERE profiles.user_id = auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.user_id = auth.uid() AND profiles.clearance_level = 'consultant'
      )
    );

  -- Same self-service PATCH upserts the caller's own email_signatures row
  -- (lib/email/signature-admin.ts upsertEmailSignature) -- needs insert +
  -- update, not just the existing consultant_select_own read grant.
  DROP POLICY IF EXISTS email_signatures_consultant_write_own ON public.email_signatures;
  CREATE POLICY email_signatures_consultant_write_own ON public.email_signatures
    FOR ALL TO authenticated
    USING (
      profile_id IN (SELECT user_id FROM public.profiles WHERE profiles.user_id = auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.user_id = auth.uid() AND profiles.clearance_level = 'consultant'
      )
    )
    WITH CHECK (
      profile_id IN (SELECT user_id FROM public.profiles WHERE profiles.user_id = auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.user_id = auth.uid() AND profiles.clearance_level = 'consultant'
      )
    );
END;
$$;

NOTIFY pgrst, 'reload schema';
