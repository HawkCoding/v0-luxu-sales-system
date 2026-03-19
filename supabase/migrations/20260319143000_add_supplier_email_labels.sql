CREATE TABLE IF NOT EXISTS public.supplier_email_labels (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT supplier_email_labels_pkey PRIMARY KEY (id),
  CONSTRAINT supplier_email_labels_name_unique UNIQUE (name)
);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_email_labels_name_lower_unique_idx
  ON public.supplier_email_labels USING btree (lower(name));

CREATE INDEX IF NOT EXISTS supplier_email_labels_sort_order_idx
  ON public.supplier_email_labels USING btree (sort_order, name);

INSERT INTO public.supplier_email_labels (name, sort_order)
VALUES
  ('General', 0),
  ('Reservations', 1),
  ('Accounts', 2),
  ('Management', 3),
  ('Operations', 4)
ON CONFLICT (name) DO NOTHING;

GRANT ALL ON TABLE public.supplier_email_labels TO anon;
GRANT ALL ON TABLE public.supplier_email_labels TO authenticated;
GRANT ALL ON TABLE public.supplier_email_labels TO service_role;

ALTER TABLE public.supplier_email_labels ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'supplier_email_labels'
      AND policyname = 'ref_select'
  ) THEN
    CREATE POLICY ref_select ON public.supplier_email_labels
      FOR SELECT TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'supplier_email_labels'
      AND policyname = 'ref_insert'
  ) THEN
    CREATE POLICY ref_insert ON public.supplier_email_labels
      FOR INSERT TO authenticated
      WITH CHECK (
        public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role])
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'supplier_email_labels'
      AND policyname = 'ref_update'
  ) THEN
    CREATE POLICY ref_update ON public.supplier_email_labels
      FOR UPDATE TO authenticated
      USING (
        public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role])
      )
      WITH CHECK (
        public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role])
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'supplier_email_labels'
      AND policyname = 'ref_delete'
  ) THEN
    CREATE POLICY ref_delete ON public.supplier_email_labels
      FOR DELETE TO authenticated
      USING (
        public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role])
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
