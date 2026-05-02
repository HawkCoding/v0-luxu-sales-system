CREATE TABLE IF NOT EXISTS public.inbound_email_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    host text NOT NULL,
    port integer DEFAULT 993 NOT NULL,
    tls_mode text DEFAULT 'ssl_tls'::text NOT NULL,
    username text NOT NULL,
    password_encrypted text NOT NULL,
    inbox_folder text DEFAULT 'INBOX'::text NOT NULL,
    processed_folder text DEFAULT 'Processed'::text NOT NULL,
    needs_review_folder text DEFAULT 'Needs Review'::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    last_uidvalidity bigint,
    last_seen_uid bigint DEFAULT 0 NOT NULL,
    first_sync_completed boolean DEFAULT false NOT NULL,
    last_synced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inbound_email_accounts_tls_mode_check CHECK (tls_mode IN ('ssl_tls', 'starttls', 'none')),
    CONSTRAINT inbound_email_accounts_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.inbound_email_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    subject_pattern text NOT NULL,
    match_type text DEFAULT 'contains'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inbound_email_rules_match_type_check CHECK (match_type IN ('contains', 'exact', 'regex')),
    CONSTRAINT inbound_email_rules_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.inbound_email_sync_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email_account_id uuid REFERENCES public.inbound_email_accounts(id) ON DELETE SET NULL,
    status text DEFAULT 'running'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    scanned_count integer DEFAULT 0 NOT NULL,
    imported_count integer DEFAULT 0 NOT NULL,
    needs_review_count integer DEFAULT 0 NOT NULL,
    duplicate_count integer DEFAULT 0 NOT NULL,
    error text,
    CONSTRAINT inbound_email_sync_runs_status_check CHECK (status IN ('running', 'success', 'partial', 'failed')),
    CONSTRAINT inbound_email_sync_runs_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.inbound_email_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email_account_id uuid NOT NULL REFERENCES public.inbound_email_accounts(id) ON DELETE CASCADE,
    sync_run_id uuid REFERENCES public.inbound_email_sync_runs(id) ON DELETE SET NULL,
    booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
    uidvalidity bigint NOT NULL,
    uid bigint NOT NULL,
    message_id text,
    subject text NOT NULL,
    from_address text,
    received_at timestamp with time zone,
    status text DEFAULT 'imported_complete'::text NOT NULL,
    filing_status text DEFAULT 'filed'::text NOT NULL,
    missing_fields text[] DEFAULT '{}'::text[] NOT NULL,
    warnings text[] DEFAULT '{}'::text[] NOT NULL,
    raw_preview text,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inbound_email_messages_filing_status_check CHECK (filing_status IN ('filed', 'filing_failed', 'not_applicable')),
    CONSTRAINT inbound_email_messages_status_check CHECK (status IN ('imported_complete', 'imported_needs_review', 'failed')),
    CONSTRAINT inbound_email_messages_pkey PRIMARY KEY (id),
    CONSTRAINT inbound_email_messages_identity_key UNIQUE (email_account_id, uidvalidity, uid)
);

ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS email_import_needs_review boolean DEFAULT false NOT NULL,
    ADD COLUMN IF NOT EXISTS email_import_review_resolved_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS email_import_review_resolved_by uuid REFERENCES auth.users(id),
    ADD COLUMN IF NOT EXISTS email_import_missing_fields text[] DEFAULT '{}'::text[] NOT NULL,
    ADD COLUMN IF NOT EXISTS email_import_warnings text[] DEFAULT '{}'::text[] NOT NULL,
    ADD COLUMN IF NOT EXISTS email_import_source_message_id uuid REFERENCES public.inbound_email_messages(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS email_import_duplicate_of_booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS email_import_subject text,
    ADD COLUMN IF NOT EXISTS email_import_mailbox text,
    ADD COLUMN IF NOT EXISTS email_import_received_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS email_import_raw_preview text;

CREATE INDEX IF NOT EXISTS idx_inbound_email_accounts_enabled ON public.inbound_email_accounts(enabled);
CREATE INDEX IF NOT EXISTS idx_inbound_email_rules_active ON public.inbound_email_rules(active);
CREATE INDEX IF NOT EXISTS idx_inbound_email_messages_account_created ON public.inbound_email_messages(email_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbound_email_messages_booking_id ON public.inbound_email_messages(booking_id);
CREATE INDEX IF NOT EXISTS idx_bookings_email_review ON public.bookings(email_import_needs_review) WHERE email_import_needs_review = true;
CREATE INDEX IF NOT EXISTS idx_bookings_email_received_at ON public.bookings(email_import_received_at);

CREATE OR REPLACE TRIGGER trg_updated_at_inbound_email_accounts
BEFORE UPDATE ON public.inbound_email_accounts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_updated_at_inbound_email_rules
BEFORE UPDATE ON public.inbound_email_rules
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_updated_at_inbound_email_messages
BEFORE UPDATE ON public.inbound_email_messages
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.inbound_email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_email_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_email_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_email_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inbound_accounts_admin_all ON public.inbound_email_accounts;
CREATE POLICY inbound_accounts_admin_all ON public.inbound_email_accounts
FOR ALL TO authenticated
USING (public.auth_has_role(ARRAY['admin'::public.user_role]))
WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role]));

DROP POLICY IF EXISTS inbound_rules_admin_all ON public.inbound_email_rules;
CREATE POLICY inbound_rules_admin_all ON public.inbound_email_rules
FOR ALL TO authenticated
USING (public.auth_has_role(ARRAY['admin'::public.user_role]))
WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role]));

DROP POLICY IF EXISTS inbound_sync_runs_admin_all ON public.inbound_email_sync_runs;
CREATE POLICY inbound_sync_runs_admin_all ON public.inbound_email_sync_runs
FOR ALL TO authenticated
USING (public.auth_has_role(ARRAY['admin'::public.user_role]))
WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role]));

DROP POLICY IF EXISTS inbound_messages_admin_all ON public.inbound_email_messages;
CREATE POLICY inbound_messages_admin_all ON public.inbound_email_messages
FOR ALL TO authenticated
USING (public.auth_has_role(ARRAY['admin'::public.user_role]))
WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role]));

GRANT ALL ON TABLE public.inbound_email_accounts TO authenticated;
GRANT ALL ON TABLE public.inbound_email_accounts TO service_role;
GRANT ALL ON TABLE public.inbound_email_rules TO authenticated;
GRANT ALL ON TABLE public.inbound_email_rules TO service_role;
GRANT ALL ON TABLE public.inbound_email_sync_runs TO authenticated;
GRANT ALL ON TABLE public.inbound_email_sync_runs TO service_role;
GRANT ALL ON TABLE public.inbound_email_messages TO authenticated;
GRANT ALL ON TABLE public.inbound_email_messages TO service_role;
