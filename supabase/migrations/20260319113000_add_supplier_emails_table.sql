CREATE TABLE IF NOT EXISTS public.supplier_emails (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  supplier_id uuid NOT NULL,
  email text NOT NULL,
  label text DEFAULT 'General'::text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT supplier_emails_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'supplier_emails_supplier_id_fkey'
  ) THEN
    ALTER TABLE ONLY public.supplier_emails
      ADD CONSTRAINT supplier_emails_supplier_id_fkey
      FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_supplier_emails_supplier_id
  ON public.supplier_emails USING btree (supplier_id);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_emails_supplier_id_email_unique_idx
  ON public.supplier_emails USING btree (supplier_id, lower(email));

INSERT INTO public.supplier_emails (supplier_id, email, label)
SELECT suppliers.id, trim(suppliers.email), 'General'
FROM public.suppliers AS suppliers
WHERE suppliers.email IS NOT NULL
  AND trim(suppliers.email) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM public.supplier_emails existing
    WHERE existing.supplier_id = suppliers.id
      AND lower(existing.email) = lower(trim(suppliers.email))
  );

GRANT ALL ON TABLE public.supplier_emails TO anon;
GRANT ALL ON TABLE public.supplier_emails TO authenticated;
GRANT ALL ON TABLE public.supplier_emails TO service_role;

ALTER TABLE public.supplier_emails ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'supplier_emails'
      AND policyname = 'ref_select'
  ) THEN
    CREATE POLICY ref_select ON public.supplier_emails
      FOR SELECT TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'supplier_emails'
      AND policyname = 'ref_insert'
  ) THEN
    CREATE POLICY ref_insert ON public.supplier_emails
      FOR INSERT TO authenticated
      WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'supplier_emails'
      AND policyname = 'ref_update'
  ) THEN
    CREATE POLICY ref_update ON public.supplier_emails
      FOR UPDATE TO authenticated
      USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
      WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'supplier_emails'
      AND policyname = 'ref_delete'
  ) THEN
    CREATE POLICY ref_delete ON public.supplier_emails
      FOR DELETE TO authenticated
      USING (public.auth_has_role(ARRAY['admin'::public.user_role]));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
