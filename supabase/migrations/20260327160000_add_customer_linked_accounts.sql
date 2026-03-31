CREATE TABLE IF NOT EXISTS public.customer_linked_accounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL,
  linked_customer_id uuid,
  relationship text,
  first_name text,
  last_name text,
  email text,
  phone text,
  is_mirror boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT customer_linked_accounts_pkey PRIMARY KEY (id),
  CONSTRAINT customer_linked_accounts_not_self_link CHECK (
    linked_customer_id IS NULL OR customer_id <> linked_customer_id
  )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customer_linked_accounts_customer_id_fkey'
  ) THEN
    ALTER TABLE ONLY public.customer_linked_accounts
      ADD CONSTRAINT customer_linked_accounts_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customer_linked_accounts_linked_customer_id_fkey'
  ) THEN
    ALTER TABLE ONLY public.customer_linked_accounts
      ADD CONSTRAINT customer_linked_accounts_linked_customer_id_fkey
      FOREIGN KEY (linked_customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customer_linked_accounts_customer_id
  ON public.customer_linked_accounts USING btree (customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_linked_accounts_linked_customer_id
  ON public.customer_linked_accounts USING btree (linked_customer_id)
  WHERE linked_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customer_linked_accounts_unique_link
  ON public.customer_linked_accounts USING btree (customer_id, linked_customer_id)
  WHERE linked_customer_id IS NOT NULL;

GRANT ALL ON TABLE public.customer_linked_accounts TO anon;
GRANT ALL ON TABLE public.customer_linked_accounts TO authenticated;
GRANT ALL ON TABLE public.customer_linked_accounts TO service_role;

ALTER TABLE public.customer_linked_accounts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customer_linked_accounts'
      AND policyname = 'cla_select'
  ) THEN
    CREATE POLICY cla_select ON public.customer_linked_accounts
      FOR SELECT TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customer_linked_accounts'
      AND policyname = 'cla_insert'
  ) THEN
    CREATE POLICY cla_insert ON public.customer_linked_accounts
      FOR INSERT TO authenticated
      WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customer_linked_accounts'
      AND policyname = 'cla_update'
  ) THEN
    CREATE POLICY cla_update ON public.customer_linked_accounts
      FOR UPDATE TO authenticated
      USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
      WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customer_linked_accounts'
      AND policyname = 'cla_delete'
  ) THEN
    CREATE POLICY cla_delete ON public.customer_linked_accounts
      FOR DELETE TO authenticated
      USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
